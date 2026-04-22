import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { pool } from "../config/db.js";
import { getTableColumnMap } from "../utils/schemaCache.js";

const jwtSecret = process.env.JWT_SECRET || "bishe_jwt_secret";
if (!process.env.JWT_SECRET) {
  console.warn("[SECURITY WARNING] JWT_SECRET not set in .env, using insecure default. Set a strong secret in production!");
}
const jwtExpire = process.env.JWT_EXPIRES_IN || "7d";
const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
const emailCodeTtlMinutes = 5;
const emailCodeCooldownSeconds = 60;
const smtpHost = String(process.env.SMTP_HOST || "").trim();
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = String(process.env.SMTP_USER || "").trim();
const smtpPass = String(process.env.SMTP_PASS || "").trim();
const smtpFrom = String(process.env.SMTP_FROM || smtpUser).trim();
const smtpSecure = String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true";
let mailTransporter = null;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isEmailFormatValid(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildEmailCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function hashEmailCode(code) {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

function getMailTransporter() {
  if (mailTransporter) {
    return mailTransporter;
  }
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
    return null;
  }
  mailTransporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });
  return mailTransporter;
}

function normalizeRole(role) {
  if (!role || typeof role !== "string") {
    return "user";
  }

  const normalized = role.trim().toLowerCase();
  if (normalized === "admin") {
    return "admin";
  }
  if (normalized === "super_admin") {
    return "super_admin";
  }
  return "user";
}

function parseEnumValues(typeValue) {
  if (!typeValue || typeof typeValue !== "string") {
    return null;
  }
  const match = typeValue.match(/^enum\((.*)\)$/i);
  if (!match) {
    return null;
  }
  const raw = match[1];
  const values = [];
  const regex = /'((?:\\'|[^'])*)'/g;
  let current;
  while ((current = regex.exec(raw))) {
    values.push(current[1].replace(/\\'/g, "'"));
  }
  return values.length ? values : null;
}

function resolveRoleValue(role, columnType) {
  const normalizedRole = normalizeRole(role);
  if (!columnType) {
    return normalizedRole;
  }
  const enumValues = parseEnumValues(columnType);
  if (enumValues) {
    const lowerValues = enumValues.map((value) => String(value).toLowerCase());
    const directIndex = lowerValues.indexOf(normalizedRole);
    if (directIndex >= 0) {
      return enumValues[directIndex];
    }
    return enumValues[0];
  }
  const lowerType = String(columnType).toLowerCase();
  if (/(tinyint|smallint|int|bigint|decimal|float|double)/.test(lowerType)) {
    return normalizedRole === "admin" || normalizedRole === "super_admin" ? 1 : 0;
  }
  return normalizedRole;
}

function resolveOptionalValue(rawValue, columnDef) {
  const trimmed = typeof rawValue === "string" ? rawValue.trim() : "";
  const nullable = columnDef?.Null === "YES";
  const typeValue = String(columnDef?.Type || "").toLowerCase();
  const isNumeric = /(tinyint|smallint|int|bigint|decimal|float|double)/.test(typeValue);
  if (!trimmed) {
    if (nullable) {
      return null;
    }
    return isNumeric ? 0 : "";
  }
  if (isNumeric) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    return nullable ? null : 0;
  }
  return trimmed;
}

export async function sendEmailVerificationCode(req, res) {
  const safeEmail = normalizeEmail(req.body?.email);
  if (!safeEmail || !isEmailFormatValid(safeEmail)) {
    return res.status(400).json({
      ok: false,
      message: "请输入有效的邮箱地址"
    });
  }
  const transporter = getMailTransporter();
  if (!transporter) {
    return res.status(500).json({
      ok: false,
      message: "邮件服务未配置，请联系管理员设置 SMTP 参数"
    });
  }
  try {
    const [latestRows] = await pool.query(
      `SELECT created_at
       FROM email_verify_codes
       WHERE email = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [safeEmail]
    );
    const latestCreatedAt = latestRows?.[0]?.created_at ? new Date(latestRows[0].created_at) : null;
    if (latestCreatedAt) {
      const secondsFromLast = Math.floor((Date.now() - latestCreatedAt.getTime()) / 1000);
      if (secondsFromLast < emailCodeCooldownSeconds) {
        return res.status(429).json({
          ok: false,
          message: `发送过于频繁，请 ${emailCodeCooldownSeconds - secondsFromLast} 秒后重试`
        });
      }
    }

    const [userRows] = await pool.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [safeEmail]
    );
    if (userRows.length > 0) {
      return res.status(409).json({
        ok: false,
        message: "该邮箱已被注册"
      });
    }

    const code = buildEmailCode();
    const codeHash = hashEmailCode(code);
    const expiresAt = new Date(Date.now() + emailCodeTtlMinutes * 60 * 1000);
    await pool.query(
      `INSERT INTO email_verify_codes (email, code_hash, expires_at, created_at)
       VALUES (?, ?, ?, NOW())`,
      [safeEmail, codeHash, expiresAt]
    );

    const subject = "注册验证码";
    const text = `您的注册验证码是 ${code}，5 分钟内有效。`;
    const html = `<div><p>您的注册验证码是 <strong>${code}</strong></p><p>验证码 5 分钟内有效，请勿泄露给他人。</p></div>`;
    await transporter.sendMail({
      from: smtpFrom,
      to: safeEmail,
      subject,
      text,
      html
    });

    return res.status(201).json({
      ok: true,
      message: "验证码已发送，请查收邮箱",
      data: {
        email: safeEmail,
        ttlMinutes: emailCodeTtlMinutes,
        cooldownSeconds: emailCodeCooldownSeconds
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "发送验证码失败",
      error: error.message
    });
  }
}

export async function register(req, res) {
  const { username, password, role, email, organization, emailCode } = req.body ?? {};
  const safeUsername = String(username || "").trim();
  const safeEmail = normalizeEmail(email);
  const safeEmailCode = String(emailCode || "").trim();

  if (!safeUsername || !password || !safeEmail || !safeEmailCode) {
    return res.status(400).json({
      ok: false,
      message: "username、password、email、emailCode 为必填项"
    });
  }
  if (!isEmailFormatValid(safeEmail)) {
    return res.status(400).json({
      ok: false,
      message: "邮箱格式不正确"
    });
  }

  try {
    const [existsRows] = await pool.query(
      "SELECT id FROM users WHERE username = ? LIMIT 1",
      [safeUsername]
    );

    if (existsRows.length > 0) {
      return res.status(409).json({
        ok: false,
        message: "用户名已存在"
      });
    }

    const columnMap = await getTableColumnMap("users");
    if (!columnMap.has("email")) {
      return res.status(500).json({
        ok: false,
        message: "用户表缺少 email 字段，无法完成邮箱验证注册"
      });
    }
    const [emailExistsRows] = await pool.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [safeEmail]
    );
    if (emailExistsRows.length > 0) {
      return res.status(409).json({
        ok: false,
        message: "邮箱已被注册"
      });
    }
    const [codeRows] = await pool.query(
      `SELECT code_hash
       FROM email_verify_codes
       WHERE email = ? AND expires_at > NOW()
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [safeEmail]
    );
    if (codeRows.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "验证码不存在或已过期，请重新获取"
      });
    }
    const expectedCodeHash = String(codeRows[0].code_hash || "");
    if (!expectedCodeHash || expectedCodeHash !== hashEmailCode(safeEmailCode)) {
      return res.status(400).json({
        ok: false,
        message: "验证码错误"
      });
    }
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const roleColumnType = columnMap.get("role")?.Type || "";
    const userRole = resolveRoleValue("user", roleColumnType);
    const safeOrganization = resolveOptionalValue(organization, columnMap.get("organization"));

    const insertColumns = ["username", "password"];
    const insertValues = [safeUsername, passwordHash];
    if (columnMap.has("role")) {
      insertColumns.push("role");
      insertValues.push(userRole);
    }
    if (columnMap.has("email")) {
      insertColumns.push("email");
      insertValues.push(safeEmail);
    }
    if (columnMap.has("organization")) {
      insertColumns.push("organization");
      insertValues.push(safeOrganization);
    }
    insertColumns.push("created_at", "updated_at");
    const placeholders = insertColumns.map(() => "?").join(", ");
    const connection = await pool.getConnection();
    let result;
    try {
      await connection.beginTransaction();
      const [freshCodeRows] = await connection.query(
        `SELECT code_hash
         FROM email_verify_codes
         WHERE email = ? AND expires_at > NOW()
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [safeEmail]
      );
      const freshCodeHash = String(freshCodeRows?.[0]?.code_hash || "");
      if (!freshCodeHash || freshCodeHash !== hashEmailCode(safeEmailCode)) {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          message: "验证码不存在、已过期或已失效，请重新获取"
        });
      }
      [result] = await connection.query(
        `INSERT INTO users (${insertColumns.join(", ")})
         VALUES (${placeholders})`,
        [...insertValues, new Date(), new Date()]
      );
      await connection.query(
        "DELETE FROM email_verify_codes WHERE email = ?",
        [safeEmail]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return res.status(201).json({
      ok: true,
      message: "注册成功",
      data: {
        id: result.insertId,
        username: safeUsername,
        role: userRole,
        email: safeEmail || null,
        organization: safeOrganization || null
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "注册失败",
      error: error.message
    });
  }
}

export async function login(req, res) {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({
      ok: false,
      message: "username 和 password 为必填项"
    });
  }

  try {
    const [rows] = await pool.query(
      "SELECT id, username, password, role, email, organization FROM users WHERE username = ? LIMIT 1",
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        ok: false,
        message: "用户名或密码错误"
      });
    }

    const user = rows[0];
    const passwordMatched = await bcrypt.compare(password, user.password);

    if (!passwordMatched) {
      return res.status(401).json({
        ok: false,
        message: "用户名或密码错误"
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role
      },
      jwtSecret,
      { expiresIn: jwtExpire }
    );

    return res.json({
      ok: true,
      message: "登录成功",
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          email: user.email,
          organization: user.organization
        }
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "登录失败",
      error: error.message
    });
  }
}

export async function profile(req, res) {
  try {
    const [rows] = await pool.query(
      "SELECT id, username, role, email, organization, created_at, updated_at FROM users WHERE id = ? LIMIT 1",
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "用户不存在"
      });
    }

    return res.json({
      ok: true,
      data: rows[0]
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "获取用户信息失败",
      error: error.message
    });
  }
}

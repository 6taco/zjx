import crypto from "crypto";
import { pool } from "../config/db.js";
import { isSuperAdminRole } from "../utils/roles.js";

function normalizeTtlMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 60;
  }
  return Math.min(7 * 24 * 60, Math.max(1, Math.floor(parsed)));
}

function buildAuthorizationCode() {
  return `AUTH-${crypto.randomBytes(12).toString("hex").toUpperCase()}`;
}

function hashAuthorizationCode(code) {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

export async function isVerifyAuthorizationValid(code) {
  const safeCode = String(code || "").trim();
  if (!safeCode) {
    return false;
  }
  const codeHash = hashAuthorizationCode(safeCode);
  const [rows] = await pool.query(
    `SELECT code_hash
     FROM verify_auth_codes
     WHERE expires_at > NOW()
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    []
  );
  const latestCodeHash = String(rows?.[0]?.code_hash || "");
  return Boolean(latestCodeHash) && latestCodeHash === codeHash;
}

export async function createVerifyAuthorizationCode(req, res) {
  const userId = Number(req.user?.id || 0);
  if (!userId) {
    return res.status(401).json({
      ok: false,
      message: "未登录或登录状态已失效"
    });
  }

  try {
    const [userRows] = await pool.query(
      "SELECT role, organization FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    const currentUser = userRows?.[0];
    if (!currentUser) {
      return res.status(404).json({
        ok: false,
        message: "用户不存在"
      });
    }
    if (!isSuperAdminRole(currentUser.role)) {
      return res.status(403).json({
        ok: false,
        message: "仅总管理员可生成跨机构验证授权码"
      });
    }

    const ttlMinutes = normalizeTtlMinutes(req.body?.ttlMinutes);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    let code = "";
    let inserted = false;

    for (let index = 0; index < 5; index += 1) {
      code = buildAuthorizationCode();
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query(
          `UPDATE verify_auth_codes
           SET expires_at = NOW()
           WHERE expires_at > NOW()`
        );
        await connection.query(
          `INSERT INTO verify_auth_codes (code_hash, expires_at, created_by, created_at)
           VALUES (?, ?, ?, NOW())`,
          [hashAuthorizationCode(code), expiresAt, userId]
        );
        await connection.commit();
        inserted = true;
        break;
      } catch (error) {
        await connection.rollback();
        if (error?.code !== "ER_DUP_ENTRY") {
          throw error;
        }
      } finally {
        connection.release();
      }
    }

    if (!inserted || !code) {
      return res.status(500).json({
        ok: false,
        message: "授权码生成失败，请重试"
      });
    }

    return res.status(201).json({
      ok: true,
      message: "授权码生成成功",
      data: {
        code,
        ttlMinutes,
        expiresAt: expiresAt.toISOString(),
        policy: "latest_only"
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "生成授权码失败",
      error: error.message
    });
  }
}

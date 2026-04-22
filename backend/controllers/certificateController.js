import crypto from "crypto";
import { ethers } from "ethers";
import { pool } from "../config/db.js";
import { isVerifyAuthorizationValid } from "./verifyAuthController.js";
import { isUserRole, isAdminRole, isOrganizationAdminRole, isSuperAdminRole, canPublish, hasGlobalManagementScope } from "../utils/roles.js";
import { getTableColumns } from "../utils/schemaCache.js";
import { certRegistryAbi } from "../utils/contractAbi.js";

const pinataEndpoint = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const pinataJsonEndpoint = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const pinataApiKey = process.env.PINATA_API_KEY || "";
const pinataSecretApiKey = process.env.PINATA_SECRET_API_KEY || "";
const pinataJwt = process.env.PINATA_JWT || "";
const certRegistryAddress =
  (process.env.CERT_REGISTRY_ADDRESS || "").trim() ||
  (process.env.VITE_CERT_REGISTRY_ADDRESS || "").trim() ||
  "0x87d3D0CE658ec5E74f3f6da693dD85F26C033FdE";
const sepoliaRpcUrl =
  (process.env.SEPOLIA_RPC_URL || "").trim() ||
  (process.env.RPC_URL || "").trim() ||
  "https://sepolia.drpc.org";
const baiduOcrApiKey = (process.env.BAIDU_OCR_API_KEY || "").trim();
const baiduOcrSecretKey = (process.env.BAIDU_OCR_SECRET_KEY || "").trim();
const verifyAuthKey = (process.env.VERIFY_AUTH_KEY || "bishe_verify_auth_key").trim();
const verifyEncryptionSecret =
  (process.env.VERIFY_ENCRYPTION_SECRET || "").trim() ||
  verifyAuthKey ||
  "bishe_verify_encryption_secret";
const baiduOauthEndpoint = "https://aip.baidubce.com/oauth/2.0/token";
const baiduGeneralBasicEndpoint = "https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic";
let baiduOcrTokenCache = {
  token: "",
  expireAt: 0
};
let verifyProvider = null;
let verifyContract = null;
let verifyProviderRpcUrl = "";
let verifyContractAddress = "";

function generateCertId() {
  return crypto.randomUUID();
}

function safeEqualSecret(left, right) {
  const leftValue = String(left || "");
  const rightValue = String(right || "");
  const leftBuffer = Buffer.from(leftValue);
  const rightBuffer = Buffer.from(rightValue);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function extractVerifyAuthorization(req) {
  const headerValue = String(
    req.headers["x-verify-authorization"] ||
    req.headers["x-cross-verify-auth"] ||
    req.headers.authorization_verify ||
    ""
  ).trim();
  if (headerValue) {
    return headerValue.slice(0, 256);
  }
  return String(req.body?.verify_authorization || req.body?.authorization || "").trim().slice(0, 256);
}

async function hasVerifyAuthorization(req) {
  try {
    if (!verifyAuthKey) {
      const dynamicCode = extractVerifyAuthorization(req);
      if (!dynamicCode) {
        return false;
      }
      return isVerifyAuthorizationValid(dynamicCode);
    }
    const provided = extractVerifyAuthorization(req);
    if (!provided) {
      return false;
    }
    if (safeEqualSecret(provided, verifyAuthKey)) {
      return true;
    }
    return isVerifyAuthorizationValid(provided);
  } catch (error) {
    return false;
  }
}

function encryptVerifyPayload(payload) {
  const key = crypto.createHash("sha256").update(verifyEncryptionSecret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    nonce: iv.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: encrypted.toString("base64")
  };
}

async function verifyOnChainWithRetry(contract, certHash, maxRetries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await contract.verifyCertificate(certHash);
    } catch (error) {
      const reason = String(error?.shortMessage || error?.reason || error?.message || "").toLowerCase();
      if (reason.includes("certificate not found")) {
        throw error;
      }
      lastError = error;
      if (attempt === maxRetries) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError || new Error("链上验证失败");
}

function getVerifyContract() {
  if (
    !verifyProvider ||
    !verifyContract ||
    verifyProviderRpcUrl !== sepoliaRpcUrl ||
    verifyContractAddress !== certRegistryAddress
  ) {
    verifyProvider = new ethers.JsonRpcProvider(sepoliaRpcUrl);
    verifyContract = new ethers.Contract(certRegistryAddress, certRegistryAbi, verifyProvider);
    verifyProviderRpcUrl = sepoliaRpcUrl;
    verifyContractAddress = certRegistryAddress;
  }
  return verifyContract;
}

async function sendCrossVerifyResult(req, res, payload) {
  const hasAuthorization = await hasVerifyAuthorization(req);
  if (hasAuthorization) {
    return res.json({
      ok: true,
      encrypted: false,
      data: payload
    });
  }
  return res.json({
    ok: true,
    encrypted: true,
    message: "未获得跨机构验证授权，已返回加密内容",
    data: encryptVerifyPayload(payload)
  });
}

function resolvePinataHeaders(contentType = "") {
  if (pinataJwt) {
    const headers = { Authorization: `Bearer ${pinataJwt}` };
    if (contentType) {
      headers["Content-Type"] = contentType;
    }
    return headers;
  }
  const headers = {
    pinata_api_key: pinataApiKey,
    pinata_secret_api_key: pinataSecretApiKey
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  return headers;
}

async function getBaiduOcrAccessToken() {
  const now = Date.now();
  if (baiduOcrTokenCache.token && now < baiduOcrTokenCache.expireAt - 60000) {
    return baiduOcrTokenCache.token;
  }

  const params = new URLSearchParams();
  params.set("grant_type", "client_credentials");
  params.set("client_id", baiduOcrApiKey);
  params.set("client_secret", baiduOcrSecretKey);

  const response = await fetch(`${baiduOauthEndpoint}?${params.toString()}`);
  const data = await response.json();
  if (!response.ok || !data?.access_token) {
    const message = data?.error_description || data?.error || "百度 OCR 鉴权失败";
    throw new Error(message);
  }

  const expiresInSeconds = Number(data.expires_in || 0);
  baiduOcrTokenCache = {
    token: String(data.access_token),
    expireAt: now + Math.max(60, expiresInSeconds) * 1000
  };
  return baiduOcrTokenCache.token;
}

function normalizeIssueDate(value) {
  if (!value) {
    return "";
  }
  const toDateText = (dateValue) => {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, "0");
    const day = String(dateValue.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDateText(value);
  }
  const text = String(value).trim();
  if (!text) {
    return "";
  }
  const normalizedDateText = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (normalizedDateText) {
    return `${normalizedDateText[1]}-${normalizedDateText[2]}-${normalizedDateText[3]}`;
  }
  const match = text.match(/(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
  if (match) {
    const year = match[1];
    const month = String(match[2]).padStart(2, "0");
    const day = String(match[3]).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    return toDateText(parsedDate);
  }
  return text;
}


async function getCurrentUserAccessContext(userId) {
  const safeUserId = Number(userId || 0);
  if (!safeUserId) {
    return null;
  }
  const [userRows] = await pool.query(
    "SELECT role, organization FROM users WHERE id = ? LIMIT 1",
    [safeUserId]
  );
  if (!userRows || userRows.length === 0) {
    return null;
  }
  const user = userRows[0] || {};
  return {
    role: user.role,
    organization: String(user.organization || "").trim()
  };
}

function normalizeOrganizationStatus(value) {
  if (value === null || value === undefined) {
    return "未认证";
  }
  if (typeof value === "number") {
    return value > 0 ? "已认证" : "未认证";
  }
  const normalized = String(value).trim().toLowerCase();
  if (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "active" ||
    normalized === "verified" ||
    normalized === "enabled" ||
    normalized === "已认证"
  ) {
    return "已认证";
  }
  return "未认证";
}

async function resolveOrganizationByIssuer(issuerAddress) {
  const safeIssuer = String(issuerAddress || "").trim();
  if (!safeIssuer) {
    return {
      organizationName: "",
      walletAddress: "",
      status: "未认证"
    };
  }

  try {
    const [tableRows] = await pool.query("SHOW TABLES LIKE 'organizations'");
    if (!tableRows || tableRows.length === 0) {
      return {
        organizationName: "",
        walletAddress: safeIssuer,
        status: "未认证"
      };
    }

    const columns = await getTableColumns("organizations");
    if (!columns.has("wallet_address")) {
      return {
        organizationName: "",
        walletAddress: safeIssuer,
        status: "未认证"
      };
    }

    const organizationNameSelect = columns.has("org_name") ? "org_name" : "NULL AS org_name";
    const statusSelect = columns.has("status") ? "status" : "NULL AS status";
    const [rows] = await pool.query(
      `SELECT ${organizationNameSelect}, wallet_address, ${statusSelect}
       FROM organizations
       WHERE LOWER(wallet_address) = LOWER(?)
       LIMIT 1`,
      [safeIssuer]
    );

    if (!rows || rows.length === 0) {
      return {
        organizationName: "",
        walletAddress: safeIssuer,
        status: "未认证"
      };
    }

    const row = rows[0];
    return {
      organizationName: String(row?.org_name || "").trim(),
      walletAddress: String(row?.wallet_address || safeIssuer).trim(),
      status: normalizeOrganizationStatus(row?.status)
    };
  } catch (error) {
    return {
      organizationName: "",
      walletAddress: safeIssuer,
      status: "未认证"
    };
  }
}

export async function publishCertificate(req, res) {
  const { cert_name, owner_name, issuer, cert_no, issue_date, cert_category, certCategory, ocr_text, ocrText } = req.body ?? {};
  const certName = String(cert_name || "").trim();
  const ownerName = String(owner_name || "").trim();
  const issuerName = String(issuer || "").trim();
  const safeCertNo = String(cert_no || "").trim();
  const safeIssueDate = normalizeIssueDate(issue_date);
  const safeCategory = String(cert_category || certCategory || "").trim();
  const safeOcrText = String(ocr_text || ocrText || "").trim();
  const userId = Number(req.user?.id || 0);
  const fileBuffer = req.file?.buffer || null;
  const fileName = String(req.file?.originalname || "certificate").trim() || "certificate";
  const fileMime = String(req.file?.mimetype || "").trim() || null;

  if (!certName || !ownerName || !issuerName) {
    return res.status(400).json({
      ok: false,
      message: "cert_name、owner_name、issuer 为必填项"
    });
  }

  if (!fileBuffer) {
    return res.status(400).json({
      ok: false,
      message: "请上传证书文件"
    });
  }

  try {
    const currentAccess = await getCurrentUserAccessContext(userId);
    if (!currentAccess) {
      return res.status(404).json({
        ok: false,
        message: "用户不存在"
      });
    }
    if (isUserRole(currentAccess.role)) {
      if (!currentAccess.organization) {
        return res.status(400).json({
          ok: false,
          message: "普通用户提交草稿前需先完善所属机构"
        });
      }
      const [draftResult] = await pool.query(
        `INSERT INTO certificate_drafts (
          draft_id, cert_name, owner_name, issuer, cert_no, issue_date, cert_category, ocr_text,
          file_name, file_mime, file_data, submitted_by, submitted_organization, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
        [
          generateCertId(),
          certName,
          ownerName,
          issuerName,
          safeCertNo || null,
          safeIssueDate || null,
          safeCategory || null,
          safeOcrText || null,
          fileName,
          fileMime,
          fileBuffer,
          userId,
          currentAccess.organization
        ]
      );
      return res.status(201).json({
        ok: true,
        mode: "draft",
        message: "草稿已提交，待所属机构管理员确认后发布",
        data: {
          id: draftResult.insertId,
          cert_name: certName,
          owner_name: ownerName,
          issuer: issuerName,
          cert_no: safeCertNo || null,
          cert_category: safeCategory || null,
          issue_date: safeIssueDate || null,
          status: "pending",
          submitted_organization: currentAccess.organization
        }
      });
    }
    if (!canPublish(currentAccess.role)) {
      return res.status(403).json({
        ok: false,
        message: "仅管理员可直接发布证书"
      });
    }
    const published = await createPublishedCertificate({
      cert_name: certName,
      owner_name: ownerName,
      issuer: issuerName,
      cert_no: safeCertNo,
      issue_date: safeIssueDate,
      cert_category: safeCategory,
      ocr_text: safeOcrText,
      fileBuffer,
      fileName,
      issuerUserId: userId
    });
    return res.status(201).json({
      ok: true,
      mode: "published",
      message: "证书发布成功",
      data: published
    });
  } catch (error) {
    const message = String(error?.message || "");
    const isPinataError = message.includes("Pinata") || message.includes("HTTP ");
    const statusCode = isPinataError ? 502 : 500;
    return res.status(statusCode).json({
      ok: false,
      message: isPinataError ? `Pinata 上传失败：${message}` : `证书发布失败：${message}`,
      error: message
    });
  }
}

async function createPublishedCertificate(payload) {
  const certName = String(payload?.cert_name || "").trim();
  const ownerName = String(payload?.owner_name || "").trim();
  const issuerName = String(payload?.issuer || "").trim();
  const safeCertNo = String(payload?.cert_no || "").trim();
  const safeIssueDate = normalizeIssueDate(payload?.issue_date);
  const safeCategory = String(payload?.cert_category || "").trim();
  const safeOcrText = String(payload?.ocr_text || "").trim();
  const fileBuffer = payload?.fileBuffer;
  const fileName = String(payload?.fileName || "certificate").trim() || "certificate";
  const issuerUserId = Number(payload?.issuerUserId || 0);
  if (!certName || !ownerName || !issuerName || !fileBuffer) {
    throw new Error("发布参数不完整");
  }
  if (!pinataJwt && (!pinataApiKey || !pinataSecretApiKey)) {
    throw new Error("请配置 PINATA_JWT 或同时配置 PINATA_API_KEY 与 PINATA_SECRET_API_KEY");
  }

  const certId = generateCertId();
  const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  const columns = await getTableColumns("certificates");
  if (columns.has("cert_hash")) {
    const [existingRows] = await pool.query(
      "SELECT id, cert_no, tx_hash FROM certificates WHERE cert_hash = ? ORDER BY id ASC LIMIT 1",
      [hash]
    );
    if (Array.isArray(existingRows) && existingRows.length > 0) {
      const existing = existingRows[0] || {};
      throw new Error(
        `证书内容重复，已存在链上记录（证书ID: ${existing.id || "-"}，证书编号: ${existing.cert_no || "-"}）`
      );
    }
  }
  const formData = new FormData();
  const fileBlob = new Blob([fileBuffer]);
  formData.append("file", fileBlob, fileName);
  formData.append(
    "pinataMetadata",
    JSON.stringify({
      name: fileName,
      keyvalues: {
        cert_id: certId
      }
    })
  );
  formData.append(
    "pinataOptions",
    JSON.stringify({
      cidVersion: 1
    })
  );

  const pinataResponse = await fetch(pinataEndpoint, {
    method: "POST",
    headers: resolvePinataHeaders(),
    body: formData
  });
  const responseText = await pinataResponse.text();
  let pinataResult = null;
  if (responseText) {
    try {
      pinataResult = JSON.parse(responseText);
    } catch (parseError) {
      pinataResult = null;
    }
  }
  if (!pinataResponse.ok) {
    const message =
      pinataResult?.error ||
      pinataResult?.message ||
      responseText ||
      `HTTP ${pinataResponse.status}`;
    throw new Error(`HTTP ${pinataResponse.status} - ${message}`);
  }
  if (!pinataResult?.IpfsHash) {
    throw new Error("Pinata 返回数据缺少 IpfsHash");
  }
  const ipfsHash = pinataResult.IpfsHash;
  let ocrIpfsHash = "";
  if (safeOcrText) {
    const metadataPayload = {
      cert_id: certId,
      cert_hash: hash,
      cert_name: certName,
      owner_name: ownerName,
      issuer: issuerName,
      cert_no: safeCertNo || null,
      issue_date: safeIssueDate || null,
      cert_category: safeCategory || null,
      recognized_text: safeOcrText,
      created_at: new Date().toISOString()
    };
    const ocrResponse = await fetch(pinataJsonEndpoint, {
      method: "POST",
      headers: resolvePinataHeaders("application/json"),
      body: JSON.stringify({
        pinataMetadata: {
          name: `ocr-${certId}.json`,
          keyvalues: {
            cert_id: certId,
            type: "ocr_text"
          }
        },
        pinataContent: metadataPayload
      })
    });
    const ocrTextResponse = await ocrResponse.text();
    let ocrResult = null;
    if (ocrTextResponse) {
      try {
        ocrResult = JSON.parse(ocrTextResponse);
      } catch (parseError) {
        ocrResult = null;
      }
    }
    if (!ocrResponse.ok) {
      const message =
        ocrResult?.error ||
        ocrResult?.message ||
        ocrTextResponse ||
        `HTTP ${ocrResponse.status}`;
      throw new Error(`OCR 元数据上传失败：HTTP ${ocrResponse.status} - ${message}`);
    }
    if (!ocrResult?.IpfsHash) {
      throw new Error("OCR 元数据上传成功但返回缺少 IpfsHash");
    }
    ocrIpfsHash = ocrResult.IpfsHash;
  }

  const insertColumns = ["cert_id", "cert_name", "owner_name", "issuer", "cert_hash", "ipfs_hash"];
  const insertValues = [certId, certName, ownerName, issuerName, hash, ipfsHash];
  if (columns.has("cert_no")) {
    insertColumns.push("cert_no");
    insertValues.push(safeCertNo || null);
  }
  if (columns.has("issue_date")) {
    insertColumns.push("issue_date");
    insertValues.push(safeIssueDate || null);
  }
  if (columns.has("cert_category")) {
    insertColumns.push("cert_category");
    insertValues.push(safeCategory || null);
  }
  if (columns.has("ocr_text")) {
    insertColumns.push("ocr_text");
    insertValues.push(safeOcrText || null);
  }
  if (columns.has("ocr_ipfs_hash")) {
    insertColumns.push("ocr_ipfs_hash");
    insertValues.push(ocrIpfsHash || null);
  }
  if (columns.has("issuer_user_id") && issuerUserId > 0) {
    insertColumns.push("issuer_user_id");
    insertValues.push(issuerUserId);
  }
  insertColumns.push("created_at", "updated_at");
  const placeholders = insertColumns.map(() => "?").join(", ");
  const [result] = await pool.query(
    `INSERT INTO certificates
     (${insertColumns.join(", ")})
     VALUES (${placeholders})`,
    [...insertValues, new Date(), new Date()]
  );
  return {
    id: result.insertId,
    cert_no: safeCertNo || result.insertId,
    cert_id: certId,
    cert_name: certName,
    owner_name: ownerName,
    issuer: issuerName,
    issue_date: safeIssueDate || null,
    cert_category: safeCategory || null,
    ocr_text: safeOcrText || null,
    ocr_ipfs_hash: ocrIpfsHash || null,
    ocr_chain_key: ocrIpfsHash ? `ocr:${hash}` : null,
    cert_hash: hash,
    ipfs_hash: ipfsHash
  };
}

export async function listCertificateDrafts(req, res) {
  if (!isOrganizationAdminRole(req.user?.role)) {
    return res.status(403).json({
      ok: false,
      message: "仅机构管理员可查看草稿箱"
    });
  }
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 10)));
  const ownerName = String(req.query.owner_name || req.query.ownerName || "").trim();
  const certNo = String(req.query.cert_no || req.query.certNo || "").trim();
  const status = String(req.query.status || "pending").trim().toLowerCase();
  const statusValue = status || "pending";
  try {
    const currentAccess = await getCurrentUserAccessContext(req.user?.id);
    if (!currentAccess) {
      return res.status(404).json({
        ok: false,
        message: "用户不存在"
      });
    }
    const conditions = ["status = ?"];
    const params = [statusValue];
    if (!currentAccess.organization) {
      return res.status(400).json({
        ok: false,
        message: "管理员缺少机构信息，无法查看草稿"
      });
    }
    conditions.push("LOWER(TRIM(submitted_organization)) = LOWER(?)");
    params.push(currentAccess.organization);
    if (ownerName) {
      conditions.push("owner_name LIKE ?");
      params.push(`%${ownerName}%`);
    }
    if (certNo) {
      conditions.push("cert_no LIKE ?");
      params.push(`%${certNo}%`);
    }
    const whereClause = `WHERE ${conditions.join(" AND ")}`;
    const offset = (page - 1) * pageSize;
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM certificate_drafts ${whereClause}`,
      params
    );
    const total = Number(countRows?.[0]?.total || 0);
    const [rows] = await pool.query(
      `SELECT id, draft_id, cert_name, owner_name, issuer, cert_no, issue_date, cert_category, status, submitted_by, submitted_organization, approved_by, approved_at, published_cert_id, created_at, updated_at
       FROM certificate_drafts ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    return res.json({
      ok: true,
      data: rows,
      pagination: {
        page,
        pageSize,
        total
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "获取草稿列表失败",
      error: error.message
    });
  }
}

export async function approveCertificateDraft(req, res) {
  if (!isOrganizationAdminRole(req.user?.role)) {
    return res.status(403).json({
      ok: false,
      message: "仅机构管理员可确认草稿发布"
    });
  }
  const draftId = Number(req.params.id || 0);
  if (!draftId) {
    return res.status(400).json({
      ok: false,
      message: "缺少有效草稿 id"
    });
  }
  try {
    const currentAccess = await getCurrentUserAccessContext(req.user?.id);
    if (!currentAccess) {
      return res.status(404).json({
        ok: false,
        message: "用户不存在"
      });
    }
    const selectConditions = ["id = ?", "status = 'pending'"];
    const selectParams = [draftId];
    if (!currentAccess.organization) {
      return res.status(400).json({
        ok: false,
        message: "管理员缺少机构信息，无法确认草稿"
      });
    }
    selectConditions.push("LOWER(TRIM(submitted_organization)) = LOWER(?)");
    selectParams.push(currentAccess.organization);
    const [draftRows] = await pool.query(
      `SELECT id, cert_name, owner_name, issuer, cert_no, issue_date, cert_category, ocr_text, file_name, file_data, submitted_by
       FROM certificate_drafts
       WHERE ${selectConditions.join(" AND ")}
       LIMIT 1`,
      selectParams
    );
    if (!draftRows || draftRows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "草稿不存在或无权限确认"
      });
    }
    const [lockResult] = await pool.query(
      "UPDATE certificate_drafts SET status = 'processing', updated_at = NOW() WHERE id = ? AND status = 'pending'",
      [draftId]
    );
    if (!lockResult?.affectedRows) {
      return res.status(409).json({
        ok: false,
        message: "草稿正在处理，请刷新后重试"
      });
    }
    const draft = draftRows[0];
    const published = await createPublishedCertificate({
      cert_name: draft.cert_name,
      owner_name: draft.owner_name,
      issuer: draft.issuer,
      cert_no: draft.cert_no,
      issue_date: draft.issue_date,
      cert_category: draft.cert_category,
      ocr_text: draft.ocr_text,
      fileBuffer: draft.file_data,
      fileName: draft.file_name,
      issuerUserId: Number(draft.submitted_by || 0)
    });
    await pool.query(
      `UPDATE certificate_drafts
       SET status = 'approved',
           approved_by = ?,
           approved_at = NOW(),
           published_cert_id = ?,
           published_cert_hash = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [Number(req.user?.id || 0), Number(published.id || 0), String(published.cert_hash || ""), draftId]
    );
    return res.json({
      ok: true,
      message: "草稿确认发布成功",
      data: published
    });
  } catch (error) {
    await pool.query(
      "UPDATE certificate_drafts SET status = 'pending', updated_at = NOW() WHERE id = ? AND status = 'processing'",
      [draftId]
    );
    return res.status(500).json({
      ok: false,
      message: `草稿确认发布失败：${error.message}`,
      error: error.message
    });
  }
}

export async function listCertificates(req, res) {
  const currentUserId = Number(req.user?.id || 0);
  if (!currentUserId) {
    return res.status(401).json({
      ok: false,
      message: "未登录或登录状态已失效"
    });
  }

  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 10)));
  const certId = String(req.query.cert_id || req.query.certId || "").trim();
  const certNo = String(req.query.cert_no || req.query.certNo || "").trim();
  const certCategory = String(req.query.cert_category || req.query.certCategory || "").trim();
  const ownerName = String(req.query.owner_name || req.query.ownerName || "").trim();
  const certHash = String(req.query.cert_hash || req.query.certHash || "").trim();
  const id = String(req.query.id || "").trim();

  try {
    const currentAccess = await getCurrentUserAccessContext(currentUserId);
    if (currentAccess === null) {
      return res.status(404).json({
        ok: false,
        message: "用户不存在"
      });
    }
    const currentOrganization = currentAccess.organization;
    const hasGlobalScope = hasGlobalManagementScope(currentAccess.role);
    const columns = await getTableColumns("certificates");

    const conditions = [];
    const params = [];

    if (!hasGlobalScope) {
      if (currentOrganization && columns.has("issuer_user_id")) {
        conditions.push(
          `issuer_user_id IN (
            SELECT id FROM users
            WHERE organization IS NOT NULL
              AND TRIM(organization) <> ''
              AND LOWER(TRIM(organization)) = LOWER(?)
          )`
        );
        params.push(currentOrganization);
      } else if (columns.has("issuer_user_id")) {
        conditions.push("issuer_user_id = ?");
        params.push(currentUserId);
      } else if (currentOrganization && columns.has("issuer")) {
        conditions.push("LOWER(TRIM(issuer)) = LOWER(?)");
        params.push(currentOrganization);
      } else {
        return res.status(400).json({
          ok: false,
          message: "当前表缺少机构筛选字段，无法按机构筛选"
        });
      }
    }

    if (id && columns.has("id")) {
      conditions.push("id = ?");
      params.push(id);
    }
    if (certNo && columns.has("id") && /^\d+$/.test(certNo)) {
      conditions.push("id = ?");
      params.push(Number(certNo));
    } else if (certId) {
      const certIdConditions = [];
      const certIdParams = [];
      const isNumericId = /^\d+$/.test(certId);
      if (isNumericId && columns.has("id")) {
        certIdConditions.push("id = ?");
        certIdParams.push(Number(certId));
      }
      if (!isNumericId && columns.has("cert_id")) {
        certIdConditions.push("cert_id LIKE ?");
        certIdParams.push(`%${certId}%`);
      }
      if (certIdConditions.length) {
        conditions.push(`(${certIdConditions.join(" OR ")})`);
        params.push(...certIdParams);
      }
    }
    if (ownerName && columns.has("owner_name")) {
      conditions.push("owner_name LIKE ?");
      params.push(`%${ownerName}%`);
    }
    if (certCategory && columns.has("cert_category")) {
      conditions.push("cert_category = ?");
      params.push(certCategory);
    }
    if (certHash && columns.has("cert_hash")) {
      conditions.push("cert_hash LIKE ?");
      params.push(`%${certHash}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (page - 1) * pageSize;
    const issuerSelect = columns.has("issuer_id")
      ? "issuer_id"
      : columns.has("issuer_user_id")
        ? "issuer_user_id AS issuer_id"
        : "NULL AS issuer_id";
    const organizationSelect = columns.has("issuer") ? "issuer" : "NULL AS issuer";
    const txHashSelect = columns.has("tx_hash") ? "tx_hash" : "NULL AS tx_hash";
    const createdAtSelect = columns.has("created_at") ? "created_at" : "NULL AS created_at";

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM certificates ${whereClause}`,
      params
    );
    const total = Number(countRows?.[0]?.total || 0);

    const certIdSelect = columns.has("cert_id") ? "cert_id" : "NULL AS cert_id";
    const certNoSelect = columns.has("cert_no") ? "cert_no" : "id AS cert_no";
    const certNameSelect = columns.has("cert_name") ? "cert_name" : "NULL AS cert_name";
    const certCategorySelect = columns.has("cert_category") ? "cert_category" : "NULL AS cert_category";
    const ocrIpfsSelect = columns.has("ocr_ipfs_hash") ? "ocr_ipfs_hash" : "NULL AS ocr_ipfs_hash";
    const issueDateSelect = columns.has("issue_date") ? "issue_date" : "NULL AS issue_date";
    const [rows] = await pool.query(
      `SELECT id, ${certNoSelect}, ${certIdSelect}, ${certNameSelect}, ${certCategorySelect}, ${ocrIpfsSelect}, cert_hash, ipfs_hash, owner_name, ${organizationSelect}, ${issuerSelect}, ${txHashSelect}, ${issueDateSelect}, ${createdAtSelect}
       FROM certificates ${whereClause}
       ORDER BY ${createdAtSelect === "created_at" ? "created_at" : "id"} DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return res.json({
      ok: true,
      data: rows,
      pagination: {
        page,
        pageSize,
        total
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "获取证书列表失败",
      error: error.message
    });
  }
}

export async function verifyCertificateOnChain(req, res) {
  const inputValue = String(req.params.certHash || "").trim();
  if (!inputValue) {
    return res.status(400).json({
      ok: false,
      message: "缺少证书 Hash 或证书编号"
    });
  }

  let certHash = inputValue;
  let publishedIssuerName = "";

  try {
    const columns = await getTableColumns("certificates");
    const conditions = [];
    const params = [];

    if (columns.has("id") && /^\d+$/.test(inputValue)) {
      conditions.push("id = ?");
      params.push(Number(inputValue));
    }
    if (columns.has("cert_id")) {
      conditions.push("cert_id = ?");
      params.push(inputValue);
    }
    if (columns.has("cert_hash")) {
      conditions.push("cert_hash = ?");
      params.push(inputValue);
    }

    if (conditions.length) {
      const issuerSelect = columns.has("issuer") ? "issuer" : "NULL AS issuer";
      const [rows] = await pool.query(
        `SELECT cert_hash, ${issuerSelect} FROM certificates WHERE ${conditions.join(" OR ")} LIMIT 1`,
        params
      );
      if (rows.length > 0) {
        if (rows[0]?.cert_hash) {
          certHash = rows[0].cert_hash;
        }
        publishedIssuerName = String(rows[0]?.issuer || "").trim();
      }
    }
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "查询证书信息失败",
      error: error.message
    });
  }

  const isLikelyHash = /^[a-f0-9]{64}$/i.test(certHash);
  if (!isLikelyHash) {
    return res.status(404).json({
      ok: false,
      message: "证书不存在"
    });
  }

  if (!sepoliaRpcUrl || !certRegistryAddress) {
    return res.status(500).json({
      ok: false,
      message: "未配置链上访问地址或合约地址"
    });
  }

  try {
    const contract = getVerifyContract();
    const result = await verifyOnChainWithRetry(contract, certHash, 4);
    const ipfsHash = result?.[0] ?? "";
    const issuer = result?.[1] ?? "";
    const timestampValue = result?.[2] ?? 0n;
    const timestamp =
      typeof timestampValue === "bigint" ? Number(timestampValue) : Number(timestampValue);
    const organizationInfo = await resolveOrganizationByIssuer(issuer);
    const organizationName = publishedIssuerName || organizationInfo.organizationName;

    return await sendCrossVerifyResult(req, res, {
      cert_hash: certHash,
      ipfs_hash: ipfsHash,
      issuer,
      timestamp,
      organizationName,
      walletAddress: organizationInfo.walletAddress,
      status: organizationInfo.status
    });
  } catch (error) {
    const reason = String(error?.shortMessage || error?.reason || error?.message || "");
    if (reason.toLowerCase().includes("certificate not found")) {
      return res.status(404).json({
        ok: false,
        message: "证书不存在"
      });
    }
    return res.status(500).json({
      ok: false,
      message: "链上证书验证失败",
      error: error.message
    });
  }
}

export async function verifyCertificateFile(req, res) {
  if (!req.file) {
    return res.status(400).json({
      ok: false,
      message: "请上传证书文件"
    });
  }

  const fileBuffer = req.file.buffer;
  const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  if (!sepoliaRpcUrl || !certRegistryAddress) {
    return res.status(500).json({
      ok: false,
      message: "未配置链上访问地址或合约地址"
    });
  }

  try {
    const contract = getVerifyContract();
    const verifyByHash = async (candidateHash) => {
      try {
        await verifyOnChainWithRetry(contract, candidateHash, 2);
        return true;
      } catch (error) {
        const reason = String(error?.shortMessage || error?.reason || error?.message || "");
        if (reason.toLowerCase().includes("certificate not found")) {
          return false;
        }
        throw error;
      }
    };

    const fileHashExistsOnChain = await verifyByHash(fileHash);
    if (fileHashExistsOnChain) {
      return await sendCrossVerifyResult(req, res, {
        fileHash,
        chainHash: fileHash,
        result: "真实"
      });
    }

    const [exactRows] = await pool.query(
      `SELECT cert_id, cert_name, owner_name, issuer, cert_hash
       FROM certificates
       WHERE cert_hash = ?
       LIMIT 1`,
      [fileHash]
    );

    if (exactRows && exactRows.length > 0) {
      return await sendCrossVerifyResult(req, res, {
        fileHash,
        chainHash: fileHash,
        result: "未上链"
      });
    }

    const LEGACY_BATCH_SIZE = 200;
    let legacyOffset = 0;
    let matchedDatabaseHash = "";

    while (true) {
      const [rows] = await pool.query(
        `SELECT cert_id, cert_name, owner_name, issuer, cert_hash
         FROM certificates
         WHERE cert_hash IS NOT NULL AND cert_hash <> '' AND cert_hash <> ?
         LIMIT ? OFFSET ?`,
        [fileHash, LEGACY_BATCH_SIZE, legacyOffset]
      );

      if (!rows || rows.length === 0) {
        break;
      }

      for (const row of rows) {
        const storedHash = String(row?.cert_hash || "").trim();
        if (!storedHash) {
          continue;
        }

        const legacyHash = crypto
          .createHash("sha256")
          .update(fileBuffer)
          .update(String(row?.cert_id || ""))
          .update(String(row?.cert_name || ""))
          .update(String(row?.owner_name || ""))
          .update(String(row?.issuer || ""))
          .digest("hex");

        if (legacyHash !== storedHash) {
          continue;
        }

        matchedDatabaseHash = legacyHash;
        const legacyHashExistsOnChain = await verifyByHash(legacyHash);
        if (legacyHashExistsOnChain) {
          return await sendCrossVerifyResult(req, res, {
            fileHash,
            chainHash: legacyHash,
            result: "真实"
          });
        }
      }

      if (rows.length < LEGACY_BATCH_SIZE) {
        break;
      }
      legacyOffset += LEGACY_BATCH_SIZE;
    }

    if (matchedDatabaseHash) {
      return await sendCrossVerifyResult(req, res, {
        fileHash,
        chainHash: matchedDatabaseHash,
        result: "未上链"
      });
    }

    return await sendCrossVerifyResult(req, res, {
      fileHash,
      chainHash: "",
      result: "被篡改"
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "链上证书验证失败",
      error: error.message
    });
  }
}

export async function recognizeCertificateText(req, res) {
  if (!req.file) {
    return res.status(400).json({
      ok: false,
      message: "请上传证书图片"
    });
  }
  if (!baiduOcrApiKey || !baiduOcrSecretKey) {
    return res.status(500).json({
      ok: false,
      message: "请配置 BAIDU_OCR_API_KEY 与 BAIDU_OCR_SECRET_KEY"
    });
  }

  try {
    const accessToken = await getBaiduOcrAccessToken();
    const requestBody = new URLSearchParams();
    requestBody.set("image", req.file.buffer.toString("base64"));
    requestBody.set("language_type", "CHN_ENG");
    requestBody.set("detect_direction", "true");

    const response = await fetch(`${baiduGeneralBasicEndpoint}?access_token=${encodeURIComponent(accessToken)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: requestBody.toString()
    });
    const data = await response.json();
    if (!response.ok || data?.error_code) {
      const message = data?.error_msg || data?.error_code || "百度 OCR 识别失败";
      throw new Error(String(message));
    }

    const words = Array.isArray(data?.words_result)
      ? data.words_result
          .map((item) => String(item?.words || "").trim())
          .filter(Boolean)
      : [];
    const text = words.join("\n");
    if (!text.trim()) {
      return res.status(422).json({
        ok: false,
        message: "未识别到有效文字，请尝试更清晰的图片"
      });
    }

    return res.json({
      ok: true,
      data: {
        text,
        words
      }
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      message: `百度 OCR 识别失败：${error.message}`
    });
  }
}

export async function downloadCertificateFile(req, res) {
  const ipfsHash = String(req.params.ipfsHash || "").trim();
  if (!ipfsHash || !/^[a-zA-Z0-9]+$/.test(ipfsHash)) {
    return res.status(400).json({
      ok: false,
      message: "无效的 IPFS Hash"
    });
  }

  const gateways = [
    `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
    `https://ipfs.io/ipfs/${ipfsHash}`
  ];

  try {
    let upstreamResponse = null;
    for (const gatewayUrl of gateways) {
      const candidate = await fetch(gatewayUrl);
      if (candidate.ok) {
        upstreamResponse = candidate;
        break;
      }
    }

    if (!upstreamResponse) {
      return res.status(502).json({
        ok: false,
        message: "证书文件获取失败"
      });
    }

    const contentType = upstreamResponse.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await upstreamResponse.arrayBuffer());
    const extension = contentType.includes("pdf")
      ? ".pdf"
      : contentType.includes("png")
        ? ".png"
        : contentType.includes("jpeg")
          ? ".jpg"
          : contentType.includes("gif")
            ? ".gif"
            : "";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="certificate-${ipfsHash}${extension}"`);
    res.setHeader("Content-Length", String(buffer.length));
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "证书文件下载失败",
      error: error.message
    });
  }
}

export async function createVerifyLog(req, res) {
  const certHash = String(req.body?.cert_hash || req.body?.certHash || "").trim();
  const verifyResult = String(req.body?.result || "").trim() || "成功";
  if (!certHash) {
    return res.status(400).json({
      ok: false,
      message: "缺少 cert_hash"
    });
  }

  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const verifierIp = forwardedFor || req.ip || req.socket?.remoteAddress || "";

  try {
    const [insertResult] = await pool.query(
      `INSERT INTO verify_logs (cert_hash, verifier_ip, verify_time, result)
       VALUES (?, ?, NOW(), ?)`,
      [certHash, verifierIp, verifyResult]
    );

    return res.status(201).json({
      ok: true,
      message: "验证日志记录成功",
      data: {
        id: insertResult.insertId,
        cert_hash: certHash,
        verifier_ip: verifierIp,
        verify_time: new Date().toISOString(),
        result: verifyResult
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "记录验证日志失败",
      error: error.message
    });
  }
}

export async function updateCertificateTxHash(req, res) {
  const certId = String(req.params.id || "").trim();
  const certUniqueId = String(req.body?.cert_id || req.body?.certId || "").trim();
  const txHash = String(req.body?.tx_hash || req.body?.txHash || "").trim();

  if (!certId) {
    return res.status(400).json({
      ok: false,
      message: "缺少证书 id"
    });
  }
  if (!txHash) {
    return res.status(400).json({
      ok: false,
      message: "缺少 tx_hash"
    });
  }

  try {
    const columns = await getTableColumns("certificates");
    if (!columns.has("tx_hash")) {
      return res.status(400).json({
        ok: false,
        message: "当前表缺少 tx_hash 字段，请先添加后再保存交易哈希"
      });
    }

    const [result] = await pool.query(
      "UPDATE certificates SET tx_hash = ? WHERE id = ?",
      [txHash, certId]
    );

    if (result.affectedRows === 0 && certUniqueId) {
      const [fallbackResult] = await pool.query(
        "UPDATE certificates SET tx_hash = ? WHERE cert_id = ?",
        [txHash, certUniqueId]
      );
      if (fallbackResult.affectedRows === 0) {
        return res.status(404).json({
          ok: false,
          message: "证书不存在"
        });
      }
    } else if (result.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        message: "证书不存在"
      });
    }

    return res.json({
      ok: true,
      message: "交易哈希已更新",
      data: {
        id: Number(certId) || null,
        cert_id: certUniqueId || null,
        tx_hash: txHash
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "保存交易哈希失败",
      error: error.message
    });
  }
}

export async function adminUpdateCertificate(req, res) {
  if (!isAdminRole(req.user?.role)) {
    return res.status(403).json({
      ok: false,
      message: "仅管理员可修改证书"
    });
  }

  const certId = String(req.params.id || "").trim();
  const certName = String(req.body?.cert_name || req.body?.certName || "").trim();
  const ownerName = String(req.body?.owner_name || req.body?.ownerName || "").trim();
  const issuer = String(req.body?.issuer || "").trim();
  const certNo = String(req.body?.cert_no || req.body?.certNo || "").trim();
  const certCategory = String(req.body?.cert_category || req.body?.certCategory || "").trim();
  const issueDate = normalizeIssueDate(req.body?.issue_date || req.body?.issueDate);

  if (!certId || !/^\d+$/.test(certId)) {
    return res.status(400).json({
      ok: false,
      message: "缺少有效证书 id"
    });
  }

  try {
    const currentAccess = await getCurrentUserAccessContext(req.user?.id);
    if (currentAccess === null) {
      return res.status(404).json({
        ok: false,
        message: "用户不存在"
      });
    }
    const currentOrganization = currentAccess.organization;
    const hasGlobalScope = hasGlobalManagementScope(currentAccess.role);
    const columns = await getTableColumns("certificates");
    const [existRows] = await pool.query("SELECT id FROM certificates WHERE id = ? LIMIT 1", [Number(certId)]);
    if (!existRows || existRows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "证书不存在"
      });
    }
    const permissionConditions = ["id = ?"];
    const permissionParams = [Number(certId)];
    if (!hasGlobalScope) {
      if (currentOrganization && columns.has("issuer_user_id")) {
        permissionConditions.push(
          `issuer_user_id IN (
            SELECT id FROM users
            WHERE organization IS NOT NULL
              AND TRIM(organization) <> ''
              AND LOWER(TRIM(organization)) = LOWER(?)
          )`
        );
        permissionParams.push(currentOrganization);
      } else if (columns.has("issuer_user_id")) {
        permissionConditions.push("issuer_user_id = ?");
        permissionParams.push(Number(req.user?.id || 0));
      } else if (currentOrganization && columns.has("issuer")) {
        permissionConditions.push("LOWER(TRIM(issuer)) = LOWER(?)");
        permissionParams.push(currentOrganization);
      } else {
        return res.status(400).json({
          ok: false,
          message: "当前表缺少机构筛选字段，无法校验权限"
        });
      }
    }
    const [permissionRows] = await pool.query(
      `SELECT id FROM certificates WHERE ${permissionConditions.join(" AND ")} LIMIT 1`,
      permissionParams
    );
    if (!permissionRows || permissionRows.length === 0) {
      return res.status(403).json({
        ok: false,
        message: "仅可修改本机构证书"
      });
    }
    const updates = [];
    const values = [];

    if (certName && columns.has("cert_name")) {
      updates.push("cert_name = ?");
      values.push(certName);
    }
    if (ownerName && columns.has("owner_name")) {
      updates.push("owner_name = ?");
      values.push(ownerName);
    }
    if (issuer && columns.has("issuer")) {
      updates.push("issuer = ?");
      values.push(issuer);
    }
    if (certNo && columns.has("cert_no")) {
      updates.push("cert_no = ?");
      values.push(certNo);
    }
    if (certCategory && columns.has("cert_category")) {
      updates.push("cert_category = ?");
      values.push(certCategory);
    }
    if (issueDate && columns.has("issue_date")) {
      updates.push("issue_date = ?");
      values.push(issueDate);
    }
    if (columns.has("updated_at")) {
      updates.push("updated_at = ?");
      values.push(new Date());
    }

    if (!updates.length) {
      return res.status(400).json({
        ok: false,
        message: "没有可更新的字段"
      });
    }

    const [result] = await pool.query(
      `UPDATE certificates SET ${updates.join(", ")} WHERE id = ?`,
      [...values, Number(certId)]
    );
    if (!result.affectedRows) {
      return res.status(404).json({
        ok: false,
        message: "证书不存在"
      });
    }

    const certNoSelect = columns.has("cert_no") ? "cert_no" : "id AS cert_no";
    const certNameSelect = columns.has("cert_name") ? "cert_name" : "NULL AS cert_name";
    const certCategorySelect = columns.has("cert_category") ? "cert_category" : "NULL AS cert_category";
    const ownerNameSelect = columns.has("owner_name") ? "owner_name" : "NULL AS owner_name";
    const issuerSelect = columns.has("issuer") ? "issuer" : "NULL AS issuer";
    const issueDateSelect = columns.has("issue_date") ? "issue_date" : "NULL AS issue_date";
    const [rows] = await pool.query(
      `SELECT id, ${certNoSelect}, ${certNameSelect}, ${certCategorySelect}, ${ownerNameSelect}, ${issuerSelect}, ${issueDateSelect}
       FROM certificates
       WHERE id = ?
       LIMIT 1`,
      [Number(certId)]
    );

    return res.json({
      ok: true,
      message: "证书修改成功",
      data: rows[0] || null
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "证书修改失败",
      error: error.message
    });
  }
}

export async function adminDeleteCertificate(req, res) {
  if (!isAdminRole(req.user?.role)) {
    return res.status(403).json({
      ok: false,
      message: "仅管理员可删除证书"
    });
  }

  const certId = String(req.params.id || "").trim();
  if (!certId || !/^\d+$/.test(certId)) {
    return res.status(400).json({
      ok: false,
      message: "缺少有效证书 id"
    });
  }

  try {
    const currentAccess = await getCurrentUserAccessContext(req.user?.id);
    if (currentAccess === null) {
      return res.status(404).json({
        ok: false,
        message: "用户不存在"
      });
    }
    const currentOrganization = currentAccess.organization;
    const hasGlobalScope = hasGlobalManagementScope(currentAccess.role);
    const columns = await getTableColumns("certificates");
    const [existRows] = await pool.query("SELECT id FROM certificates WHERE id = ? LIMIT 1", [Number(certId)]);
    if (!existRows || existRows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "证书不存在"
      });
    }
    const permissionConditions = ["id = ?"];
    const permissionParams = [Number(certId)];
    if (!hasGlobalScope) {
      if (currentOrganization && columns.has("issuer_user_id")) {
        permissionConditions.push(
          `issuer_user_id IN (
            SELECT id FROM users
            WHERE organization IS NOT NULL
              AND TRIM(organization) <> ''
              AND LOWER(TRIM(organization)) = LOWER(?)
          )`
        );
        permissionParams.push(currentOrganization);
      } else if (columns.has("issuer_user_id")) {
        permissionConditions.push("issuer_user_id = ?");
        permissionParams.push(Number(req.user?.id || 0));
      } else if (currentOrganization && columns.has("issuer")) {
        permissionConditions.push("LOWER(TRIM(issuer)) = LOWER(?)");
        permissionParams.push(currentOrganization);
      } else {
        return res.status(400).json({
          ok: false,
          message: "当前表缺少机构筛选字段，无法校验权限"
        });
      }
    }
    const [permissionRows] = await pool.query(
      `SELECT id FROM certificates WHERE ${permissionConditions.join(" AND ")} LIMIT 1`,
      permissionParams
    );
    if (!permissionRows || permissionRows.length === 0) {
      return res.status(403).json({
        ok: false,
        message: "仅可删除本机构证书"
      });
    }
    const [result] = await pool.query("DELETE FROM certificates WHERE id = ?", [Number(certId)]);
    if (!result.affectedRows) {
      return res.status(404).json({
        ok: false,
        message: "证书不存在"
      });
    }
    return res.json({
      ok: true,
      message: "证书删除成功"
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "证书删除失败",
      error: error.message
    });
  }
}

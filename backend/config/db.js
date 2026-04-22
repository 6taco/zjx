import mysql from "mysql2/promise";

const dbHost = process.env.DB_HOST || "localhost";
const dbPort = Number(process.env.DB_PORT || 3306);
const dbUser = process.env.DB_USER || "root";
const dbPassword = process.env.DB_PASSWORD || "123456";
const dbName = process.env.DB_NAME || "bishe";

export const dbConfig = {
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName
};

export const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export async function ensureVerifyLogsTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS verify_logs (
      id BIGINT NOT NULL AUTO_INCREMENT,
      cert_hash VARCHAR(128) NOT NULL,
      verifier_ip VARCHAR(128) NOT NULL,
      verify_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      result VARCHAR(32) NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_verify_logs_cert_hash (cert_hash),
      INDEX idx_verify_logs_verify_time (verify_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

export async function ensureVerifyAuthCodesTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS verify_auth_codes (
      id BIGINT NOT NULL AUTO_INCREMENT,
      code_hash VARCHAR(128) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_by BIGINT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_verify_auth_code_hash (code_hash),
      INDEX idx_verify_auth_expires_at (expires_at),
      INDEX idx_verify_auth_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

export async function ensureEmailVerifyCodesTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS email_verify_codes (
      id BIGINT NOT NULL AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL,
      code_hash VARCHAR(128) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_email_verify_email_created (email, created_at),
      INDEX idx_email_verify_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

export async function ensureCertificatesSchema() {
  const [tableRows] = await pool.query("SHOW TABLES LIKE 'certificates'");
  if (!tableRows || tableRows.length === 0) {
    return;
  }

  const [columnRows] = await pool.query("SHOW COLUMNS FROM certificates");
  const columns = new Set(columnRows.map((row) => row.Field));
  const alters = [];

  if (!columns.has("cert_no")) {
    alters.push("ADD COLUMN cert_no VARCHAR(128) NULL");
  }
  if (!columns.has("issue_date")) {
    alters.push("ADD COLUMN issue_date DATE NULL");
  }
  if (!columns.has("cert_category")) {
    alters.push("ADD COLUMN cert_category VARCHAR(64) NULL");
  }
  if (!columns.has("ocr_text")) {
    alters.push("ADD COLUMN ocr_text LONGTEXT NULL");
  }
  if (!columns.has("ocr_ipfs_hash")) {
    alters.push("ADD COLUMN ocr_ipfs_hash VARCHAR(255) NULL");
  }

  if (alters.length) {
    await pool.query(`ALTER TABLE certificates ${alters.join(", ")}`);
  }
}

export async function ensureCertificateDraftsTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS certificate_drafts (
      id BIGINT NOT NULL AUTO_INCREMENT,
      draft_id VARCHAR(64) NOT NULL,
      cert_name VARCHAR(255) NOT NULL,
      owner_name VARCHAR(255) NOT NULL,
      issuer VARCHAR(255) NOT NULL,
      cert_no VARCHAR(128) NULL,
      issue_date DATE NULL,
      cert_category VARCHAR(64) NULL,
      ocr_text LONGTEXT NULL,
      file_name VARCHAR(255) NULL,
      file_mime VARCHAR(128) NULL,
      file_data LONGBLOB NOT NULL,
      submitted_by BIGINT NOT NULL,
      submitted_organization VARCHAR(255) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      approved_by BIGINT NULL,
      approved_at DATETIME NULL,
      published_cert_id BIGINT NULL,
      published_cert_hash VARCHAR(128) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_certificate_drafts_draft_id (draft_id),
      INDEX idx_certificate_drafts_status_created (status, created_at),
      INDEX idx_certificate_drafts_submitted_by (submitted_by),
      INDEX idx_certificate_drafts_submitted_org (submitted_organization)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

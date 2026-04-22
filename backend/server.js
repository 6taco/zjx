import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  pool,
  dbConfig,
  ensureVerifyLogsTable,
  ensureCertificatesSchema,
  ensureVerifyAuthCodesTable,
  ensureEmailVerifyCodesTable,
  ensureCertificateDraftsTable
} from "./config/db.js";
import userRoutes from "./routes/userRoutes.js";
import certificateRoutes from "./routes/certificateRoutes.js";
import verifyAuthRoutes from "./routes/verifyAuthRoutes.js";
import { createVerifyLog } from "./controllers/certificateController.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();
const port = process.env.PORT || 3001;

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true
  })
);
app.use(express.json({ limit: "5mb" }));
app.use("/api/users", userRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/verify-auth", verifyAuthRoutes);
const verifyLogRateMap = new Map();
const VERIFY_LOG_RATE_WINDOW_MS = 60 * 1000;
const VERIFY_LOG_RATE_MAX = 30;

function verifyLogRateLimiter(req, res, next) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
  const now = Date.now();
  const entry = verifyLogRateMap.get(ip);
  if (!entry || now - entry.startTime > VERIFY_LOG_RATE_WINDOW_MS) {
    verifyLogRateMap.set(ip, { startTime: now, count: 1 });
    return next();
  }
  entry.count += 1;
  if (entry.count > VERIFY_LOG_RATE_MAX) {
    return res.status(429).json({ ok: false, message: "请求过于频繁，请稍后再试" });
  }
  return next();
}

app.post("/api/verify/log", verifyLogRateLimiter, createVerifyLog);

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "backend",
    timestamp: new Date().toISOString()
  });
});

app.post("/api/echo", (req, res) => {
  res.json({
    ok: true,
    received: req.body ?? null
  });
});

app.get("/api/db/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      database: dbConfig.database,
      host: dbConfig.host,
      port: dbConfig.port
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Database connection failed",
      error: error.message
    });
  }
});

app.use(errorHandler);

async function startServer() {
  try {
    await ensureVerifyLogsTable();
    await ensureCertificatesSchema();
    await ensureVerifyAuthCodesTable();
    await ensureEmailVerifyCodesTable();
    await ensureCertificateDraftsTable();
    app.listen(port, () => {
      console.log(`API server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to initialize database tables:", error.message);
    process.exit(1);
  }
}

startServer();

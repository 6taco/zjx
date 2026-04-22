import multer from "multer";

export default function errorHandler(err, req, res, _next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ ok: false, message: "文件大小超过限制（最大 20MB）" });
    }
    return res.status(400).json({ ok: false, message: `文件上传错误：${err.message}` });
  }

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ ok: false, message: "跨域请求被拒绝" });
  }

  console.error("[Unhandled Error]", err.stack || err.message || err);
  return res.status(500).json({
    ok: false,
    message: "服务器内部错误，请稍后再试"
  });
}

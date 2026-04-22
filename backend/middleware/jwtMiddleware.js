import jwt from "jsonwebtoken";

const jwtSecret = process.env.JWT_SECRET || "bishe_jwt_secret";
if (!process.env.JWT_SECRET) {
  console.warn("[SECURITY WARNING] JWT_SECRET not set in .env, using insecure default.");
}

export default function jwtMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      ok: false,
      message: "未提供有效的认证令牌"
    });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      message: "令牌无效或已过期"
    });
  }
}

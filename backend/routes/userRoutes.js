import { Router } from "express";
import { login, profile, register, sendEmailVerificationCode } from "../controllers/userController.js";
import jwtMiddleware from "../middleware/jwtMiddleware.js";

const router = Router();

router.post("/register", register);
router.post("/send-email-code", sendEmailVerificationCode);
router.post("/login", login);
router.get("/profile", jwtMiddleware, profile);

export default router;

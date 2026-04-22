import { Router } from "express";
import jwtMiddleware from "../middleware/jwtMiddleware.js";
import { createVerifyAuthorizationCode } from "../controllers/verifyAuthController.js";

const router = Router();

router.post("/codes", jwtMiddleware, createVerifyAuthorizationCode);

export default router;

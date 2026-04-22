import { Router } from "express";
import multer from "multer";
import jwtMiddleware from "../middleware/jwtMiddleware.js";
import {
  listCertificates,
  listCertificateDrafts,
  publishCertificate,
  approveCertificateDraft,
  verifyCertificateOnChain,
  verifyCertificateFile,
  recognizeCertificateText,
  downloadCertificateFile,
  updateCertificateTxHash,
  adminUpdateCertificate,
  adminDeleteCertificate
} from "../controllers/certificateController.js";

const router = Router();
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }
});

router.post("/publish", jwtMiddleware, upload.single("file"), publishCertificate);
router.get("/drafts", jwtMiddleware, listCertificateDrafts);
router.post("/drafts/:id/approve", jwtMiddleware, approveCertificateDraft);
router.patch("/:id/tx", jwtMiddleware, updateCertificateTxHash);
router.patch("/:id", jwtMiddleware, adminUpdateCertificate);
router.delete("/:id", jwtMiddleware, adminDeleteCertificate);
router.get("/verify/:certHash", verifyCertificateOnChain);
router.post("/verify-file", upload.single("file"), verifyCertificateFile);
router.post("/ocr", upload.single("file"), recognizeCertificateText);
router.get("/download/:ipfsHash", downloadCertificateFile);
router.get("/", jwtMiddleware, listCertificates);

export default router;

import { Router } from "express";
import { EmailController } from "../controllers/email.controller";

const router = Router();

router.post("/send-email", EmailController.sendVerificationEmail);
router.post("/verify-email", EmailController.verifyEmail);

export default router;

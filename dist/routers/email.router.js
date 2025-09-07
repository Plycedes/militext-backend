"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const email_controller_1 = require("../controllers/email.controller");
const router = (0, express_1.Router)();
router.post("/send-email", email_controller_1.EmailController.sendVerificationEmail);
router.post("/verify-email", email_controller_1.EmailController.verifyEmail);
exports.default = router;

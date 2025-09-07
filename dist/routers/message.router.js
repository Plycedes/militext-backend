"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const multer_middleware_1 = require("../middlewares/multer.middleware");
const message_controller_1 = require("../controllers/message.controller");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.verifyJWT);
router
    .route("/:chatId")
    .get(message_controller_1.MessageController.getAllMessages)
    .post(multer_middleware_1.upload.fields([{ name: "attachments", maxCount: 30 }]), message_controller_1.MessageController.sendMessage);
//Delete message route based on Message id
router.route("/:chatId/:messageId").delete(message_controller_1.MessageController.deleteMessage);
exports.default = router;

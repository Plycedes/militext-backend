"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chat_controller_1 = require("../controllers/chat.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.verifyJWT);
router.route("/").get(chat_controller_1.ChatController.getAllChats);
router.route("/users").get(chat_controller_1.ChatController.searchAvailableUsers);
router
    .route("/c/:receiverId")
    .get(chat_controller_1.ChatController.getAOneOnOneChat)
    .post(chat_controller_1.ChatController.createAOneOnOneChat);
router.route("/group").post(chat_controller_1.ChatController.createAGroupChat);
router
    .route("/group/:chatId")
    .get(chat_controller_1.ChatController.getGroupChatDetails)
    .patch(chat_controller_1.ChatController.renameGroupChat)
    .delete(chat_controller_1.ChatController.deleteGroupChat);
router
    .route("/group/:chatId/:participantNum")
    .post(chat_controller_1.ChatController.addNewParticipantInGroupChat)
    .delete(chat_controller_1.ChatController.removeParticipantFromGroupChat);
router.route("/leave/group/:chatId").delete(chat_controller_1.ChatController.leaveGroupChat);
router.route("/remove/:chatId").delete(chat_controller_1.ChatController.deleteOneOnOneChat);
exports.default = router;

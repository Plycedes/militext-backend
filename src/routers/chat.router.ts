import { Router } from "express";
import { ChatController } from "../controllers/chat.controller";
import { verifyJWT } from "../middlewares/auth.middleware";

const router = Router();

router.use(verifyJWT);

router.route("/").get(ChatController.getAllChats);

router.route("/users").get(ChatController.searchAvailableUsers);

router.route("/c/:receiverId").post(ChatController.createOrGetAOneOnOneChat);

router.route("/group").post(ChatController.createAGroupChat);

router
    .route("/group/:chatId")
    .get(ChatController.getGroupChatDetails)
    .patch(ChatController.renameGroupChat)
    .delete(ChatController.deleteGroupChat);

router
    .route("/group/:chatId/:participantId")
    .post(ChatController.addNewParticipantInGroupChat)
    .delete(ChatController.removeParticipantFromGroupChat);

router.route("/leave/group/:chatId").delete(ChatController.leaveGroupChat);

router.route("/remove/:chatId").delete(ChatController.deleteOneOnOneChat);

export default router;

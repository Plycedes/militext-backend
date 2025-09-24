import { Router } from "express";
import { ChatController } from "../controllers/chat.controller";
import { verifyJWT } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/multer.middleware";

const router = Router();

router.use(verifyJWT);

// ---- Static routes first ----
router.route("/").get(ChatController.getAllChats);

router.route("/users").get(ChatController.searchAvailableUsers);

router.route("/group").post(ChatController.createAGroupChat);

router.route("/leave/group/:chatId").delete(ChatController.leaveGroupChat);

router.route("/remove/:chatId").delete(ChatController.deleteOneOnOneChat);

router.route("/promote").post(ChatController.promoteToAdmin);
router.route("/demote").post(ChatController.demoteFromAdmin);

// ---- Dynamic routes after ----
router
    .route("/c/:receiverId")
    .get(ChatController.getAOneOnOneChat)
    .post(ChatController.createAOneOnOneChat);

router
    .route("/group/:chatId")
    .get(ChatController.getGroupChatDetails)
    .patch(ChatController.renameGroupChat)
    .delete(ChatController.deleteGroupChat)
    .post(upload.single("avatar"), ChatController.updateGroupAvatar);

router
    .route("/group/:chatId/:participantNum")
    .post(ChatController.addNewParticipantInGroupChat)
    .delete(ChatController.removeParticipantFromGroupChat);

export default router;

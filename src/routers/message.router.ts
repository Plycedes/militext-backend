import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/multer.middleware";
import { MessageController } from "../controllers/message.controller";

const router = Router();

router.use(verifyJWT);

router
    .route("/message/attachments/upload")
    .post(upload.array("attachments", 10), MessageController.uploadMessageAttachments);

router.route("/delete/:chatId").post(MessageController.deleteMessages);
router.route("/edit/:messageId").patch(MessageController.editMessage);

router
    .route("/:chatId")
    .get(MessageController.getAllMessages)
    .post(upload.fields([{ name: "attachments", maxCount: 30 }]), MessageController.sendMessage);

export default router;

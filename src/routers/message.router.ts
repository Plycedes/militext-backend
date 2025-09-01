import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/multer.middleware";
import { MessageController } from "../controllers/message.controller";

const router = Router();

router.use(verifyJWT);

router
    .route("/:chatId")
    .get(MessageController.getAllMessages)
    .post(upload.fields([{ name: "attachments", maxCount: 30 }]), MessageController.sendMessage);

//Delete message route based on Message id

router.route("/:chatId/:messageId").delete(MessageController.deleteMessage);

export default router;

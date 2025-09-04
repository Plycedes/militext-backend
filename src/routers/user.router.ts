import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/multer.middleware";
import { UserController } from "../controllers/user.controller";

const router: Router = Router();

router.post("/register", UserController.registerUser);
router.post("/login", UserController.loginUser);

router.use(verifyJWT);

router.post("/refresh-token", UserController.refreshAccessToken);

router.get("/current-user", UserController.getCurrentUser);

router.post("/logout", UserController.logoutUser);
router.post("/change-password", UserController.changeCurrentPassword);
router.post("/reset-password", UserController.resetPassword);
router.post("/update-avatar", upload.single("avatar"), UserController.updateUserAvatar);
export default router;

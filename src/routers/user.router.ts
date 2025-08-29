import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/multer.middleware";
import {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateUserAvatar,
} from "../controllers/user.controller";

const router: Router = Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

router.use(verifyJWT);

router.post("/refresh-token", refreshAccessToken);

router.get("/current-user", getCurrentUser);

router.post("/logout", logoutUser);
router.post("/change-password", changeCurrentPassword);
router.post("/update-avatar", upload.single("avatar"), updateUserAvatar);
export default router;

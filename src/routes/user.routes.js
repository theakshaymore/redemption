import { Router } from "express";
import { registerUser } from "../middleware/user.middleware.js";

const router = Router();

router.route("/register").post(registerUser);

export default router;

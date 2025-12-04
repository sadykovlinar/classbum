// backend/routes/parents.js
import express from "express";

import {
  getMe,
  loginParent,
  registerParent,
} from "../controllers/parentAuthController.js";
import { parentAuthMiddleware } from "../middleware/parentAuth.js";

const router = express.Router();

// POST /auth/register-parent — регистрация родителя
router.post("/register-parent", registerParent);

// POST /auth/login-parent — логин родителя
router.post("/login-parent", loginParent);

// GET /auth/me — профиль родителя + дети
router.get("/me", parentAuthMiddleware, getMe);

export default router;

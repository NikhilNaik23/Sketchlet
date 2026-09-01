const express = require("express");
const { requireAuth } = require("../utils/auth");
const authController = require("../controllers/authController");
const authRoutes = require("./authRoutes");
const healthRoutes = require("./healthRoutes");
const roomRoutes = require("./roomRoutes");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.get("/me", requireAuth, authController.me);
router.use("/rooms", roomRoutes);

module.exports = router;
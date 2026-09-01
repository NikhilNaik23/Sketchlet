const express = require("express");
const { requireAuth } = require("../utils/auth");
const roomController = require("../controllers/roomController");

const router = express.Router();

router.get("/", requireAuth, roomController.list);
router.post("/", requireAuth, roomController.create);
router.post("/join", requireAuth, roomController.join);
router.get("/:roomKey", requireAuth, roomController.details);
router.post("/:roomKey/requests/:memberId/accept", requireAuth, roomController.acceptRequest);
router.post("/:roomKey/requests/:memberId/reject", requireAuth, roomController.rejectRequest);
router.patch("/:roomKey/members/:memberId", requireAuth, roomController.updateMember);
router.get("/:roomKey/elements", requireAuth, roomController.elements);

module.exports = router;
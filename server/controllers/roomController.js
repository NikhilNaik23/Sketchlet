const { roomCreateSchema, roomJoinSchema, roomMemberUpdateSchema } = require("../utils/validation");
const { serializeRoom } = require("../utils/rooms");
const {
  createRoom,
  getRoomDetails,
  getRoomElements,
  joinRoom,
  listRoomsForUser,
  reviewJoinRequest,
  updateRoomMember,
} = require("../services/roomService");

function sendValidationError(res, error) {
  return res.status(400).json({
    error: "Validation failed.",
    issues: error.issues?.map((issue) => ({ path: issue.path.join("."), message: issue.message })) || [],
  });
}

async function list(req, res) {
  return res.json({ rooms: await listRoomsForUser(req.authUser._id) });
}

async function create(req, res) {
  const parsed = roomCreateSchema.safeParse(req.body);

  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const room = await createRoom(parsed.data.name, req.authUser._id);
  return res.status(201).json({ room: serializeRoom(room, req.authUser._id) });
}

async function join(req, res) {
  const parsed = roomJoinSchema.safeParse(req.body);

  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const result = await joinRoom(parsed.data.roomKey, req.authUser._id);

    if (result.status === "requested") {
      const io = req.app.get("io");
      io?.to(result.room._id.toString()).emit("room:join-requested", {
        roomId: result.room._id.toString(),
        requesterId: req.authUser._id.toString(),
      });
      return res.status(202).json({ pending: true, message: "Join request sent. Waiting for owner approval." });
    }

    return res.json({ room: serializeRoom(result.room, req.authUser._id), joined: true });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || "Failed to join room." });
  }
}

async function acceptRequest(req, res) {
  const parsed = roomMemberUpdateSchema.safeParse(req.body);

  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const room = await reviewJoinRequest(
      req.params.roomKey,
      req.authUser._id,
      req.params.memberId,
      parsed.data.role,
      "accept"
    );
    const io = req.app.get("io");
    io?.to(room._id.toString()).emit("room:members-updated", {
      roomId: room._id.toString(),
      memberId: req.params.memberId,
      role: parsed.data.role,
    });
    io?.emitToUser?.(req.params.memberId, "room:access-reviewed", {
      roomId: room._id.toString(),
      roomName: room.name,
      roomSlug: room.slug,
      status: "accepted",
    });
    return res.json({ room: serializeRoom(room, req.authUser._id) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || "Failed to accept request." });
  }
}

async function rejectRequest(req, res) {
  try {
    const room = await reviewJoinRequest(req.params.roomKey, req.authUser._id, req.params.memberId, "viewer", "reject");
    const io = req.app.get("io");
    io?.to(room._id.toString()).emit("room:members-updated", {
      roomId: room._id.toString(),
      memberId: req.params.memberId,
      rejected: true,
    });
    io?.emitToUser?.(req.params.memberId, "room:access-reviewed", {
      roomId: room._id.toString(),
      roomName: room.name,
      roomSlug: room.slug,
      status: "rejected",
    });
    return res.json({ room: serializeRoom(room, req.authUser._id) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || "Failed to reject request." });
  }
}

async function updateMember(req, res) {
  const parsed = roomMemberUpdateSchema.safeParse(req.body);

  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const room = await updateRoomMember(req.params.roomKey, req.authUser._id, req.params.memberId, parsed.data.role);
    req.app.get("io")?.to(room._id.toString()).emit("room:members-updated", {
      roomId: room._id.toString(),
      memberId: req.params.memberId,
      role: parsed.data.role,
    });
    return res.json({ room: serializeRoom(room, req.authUser._id) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || "Failed to update room member." });
  }
}

async function elements(req, res) {
  try {
    const { room, elements } = await getRoomElements(req.params.roomKey, req.authUser._id);
    return res.json({ room: serializeRoom(room, req.authUser._id), elements });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || "Failed to load room elements." });
  }
}

async function details(req, res) {
  try {
    return res.json(await getRoomDetails(req.params.roomKey, req.authUser._id));
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || "Failed to load room details." });
  }
}

module.exports = {
  create,
  acceptRequest,
  elements,
  details,
  join,
  list,
  rejectRequest,
  updateMember,
};
const Element = require("../models/Element");
const Room = require("../models/Room");
const User = require("../models/User");
const { buildRoomLookup, generateRoomSlug, getRoomRole, ROLES, serializeRoom } = require("../utils/rooms");

function normalizeRoomName(name) {
  return name.trim().toLowerCase();
}

async function createRoom(name, ownerId) {
  const normalizedName = normalizeRoomName(name);
  const existing = await Room.findOne({ nameLower: normalizedName }).lean();

  if (existing) {
    const error = new Error("Room name already exists.");
    error.statusCode = 409;
    throw error;
  }

  return Room.create({
    name,
    nameLower: normalizedName,
    slug: generateRoomSlug(name),
    ownerId,
    members: [{ userId: ownerId, role: ROLES.OWNER }],
  });
}

async function listRoomsForUser(userId) {
  const rooms = await Room.find({ "members.userId": userId }).sort({ updatedAt: -1 }).lean();
  return rooms.map((room) => serializeRoom(room, userId));
}

async function findRoomForUser(roomKey, userId) {
  return Room.findOne({
    ...buildRoomLookup(roomKey),
    "members.userId": userId,
  });
}

async function joinRoom(roomKey, userId) {
  const room = await Room.findOne(buildRoomLookup(roomKey));

  if (!room) {
    const error = new Error("Room not found.");
    error.statusCode = 404;
    throw error;
  }

  const existingMember = room.members.find((member) => member.userId.toString() === userId.toString());

  if (existingMember) {
    return { room, status: "joined" };
  }

  const existingRequest = room.joinRequests.find((request) => request.userId.toString() === userId.toString());

  if (existingRequest) {
    return { room, status: "pending" };
  }

  room.joinRequests.push({ userId });
  await room.save();

  return { room, status: "requested" };
}

async function reviewJoinRequest(roomKey, actorUserId, requestUserId, role, action) {
  const room = await findRoomForUser(roomKey, actorUserId);

  if (!room) {
    const error = new Error("Room not found.");
    error.statusCode = 404;
    throw error;
  }

  if (getRoomRole(room, actorUserId) !== ROLES.OWNER) {
    const error = new Error("Only the room owner can review requests.");
    error.statusCode = 403;
    throw error;
  }

  const requestIndex = room.joinRequests.findIndex((request) => request.userId.toString() === requestUserId);
  if (requestIndex === -1) {
    const error = new Error("Join request not found.");
    error.statusCode = 404;
    throw error;
  }

  const [request] = room.joinRequests.splice(requestIndex, 1);

  if (action === "accept") {
    const existingMember = room.members.find((member) => member.userId.toString() === request.userId.toString());
    if (existingMember) {
      existingMember.role = role;
    } else {
      room.members.push({ userId: request.userId, role });
    }
  }

  await room.save();
  return room;
}

async function updateRoomMember(roomKey, actorUserId, memberId, role) {
  const room = await findRoomForUser(roomKey, actorUserId);

  if (!room) {
    const error = new Error("Room not found.");
    error.statusCode = 404;
    throw error;
  }

  if (getRoomRole(room, actorUserId) !== ROLES.OWNER) {
    const error = new Error("Only the room owner can manage roles.");
    error.statusCode = 403;
    throw error;
  }

  const member = room.members.find((entry) => entry.userId.toString() === memberId);
  if (!member) {
    const error = new Error("Room member not found.");
    error.statusCode = 404;
    throw error;
  }

  member.role = role;
  await room.save();
  return room;
}

async function getRoomElements(roomKey, userId) {
  const room = await findRoomForUser(roomKey, userId);

  if (!room) {
    const error = new Error("Room not found.");
    error.statusCode = 404;
    throw error;
  }

  const elements = await Element.find({ roomId: room._id }).sort({ createdAt: 1 }).lean();
  return { room, elements };
}

async function getRoomDetails(roomKey, userId) {
  const room = await findRoomForUser(roomKey, userId);

  if (!room) {
    const error = new Error("Room not found.");
    error.statusCode = 404;
    throw error;
  }

  const memberIds = room.members.map((member) => member.userId);
  const users = await User.find({ _id: { $in: memberIds } }).lean();
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  const requestIds = room.joinRequests.map((request) => request.userId);
  const requestUsers = requestIds.length ? await User.find({ _id: { $in: requestIds } }).lean() : [];
  const requestUsersById = new Map(requestUsers.map((user) => [user._id.toString(), user]));

  return {
    room: serializeRoom(room, userId),
    members: room.members.map((member) => {
      const user = usersById.get(member.userId.toString());
      return {
        id: member.userId.toString(),
        name: user?.name || "Unknown",
        email: user?.email || "",
        color: user?.color || "#9CA3AF",
        role: member.role,
      };
    }),
    requests: room.joinRequests.map((request) => {
      const user = requestUsersById.get(request.userId.toString());
      return {
        id: request.userId.toString(),
        name: user?.name || "Unknown",
        email: user?.email || "",
        color: user?.color || "#9CA3AF",
        requestedAt: request.requestedAt,
      };
    }),
  };
}

async function getRoomRoleLive(roomId, userId) {
  const room = await Room.findOne({ _id: roomId, "members.userId": userId }).lean();

  if (!room) return null;

  const member = room.members.find((entry) => entry.userId.toString() === userId.toString());
  return member?.role || null;
}

module.exports = {
  createRoom,
  getRoomElements,
  getRoomDetails,
  getRoomRoleLive,
  joinRoom,
  listRoomsForUser,
  reviewJoinRequest,
  updateRoomMember,
};
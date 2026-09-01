const Element = require("../models/Element");
const Room = require("../models/Room");
const { authenticateSocket } = require("../utils/auth");
const { buildRoomLookup, canEditRoom, getRoomRole, serializeRoom } = require("../utils/rooms");
const { getRoomRoleLive } = require("../services/roomService");
const {
  cursorMoveSchema,
  elementCreateSchema,
  elementDeleteSchema,
  elementUpdateSchema,
  roomJoinSchema,
  strokeEndSchema,
  strokePointSchema,
  strokeStartSchema,
} = require("../utils/validation");

const ADJECTIVES = ["Amber", "Cosmic", "Quiet", "Bright", "Swift", "Bold", "Mellow", "Vivid"];
const ANIMALS = ["Fox", "Otter", "Falcon", "Heron", "Lynx", "Panda", "Wren", "Ibex"];
const COLORS = ["#F97316", "#EC4899", "#8B5CF6", "#06B6D4", "#22C55E", "#EAB308", "#EF4444", "#3B82F6"];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeGuestIdentity() {
  return {
    name: `${randomFrom(ADJECTIVES)} ${randomFrom(ANIMALS)}`,
    color: randomFrom(COLORS),
  };
}

const eventLimits = new Map();
const roomPresence = new Map();
const userSockets = new Map();

function getRoomPresence(roomId) {
  if (!roomPresence.has(roomId)) {
    roomPresence.set(roomId, new Map());
  }

  return roomPresence.get(roomId);
}

function listRoomUsers(roomId) {
  return Array.from(getRoomPresence(roomId).values());
}

function addPresence(roomId, identity) {
  getRoomPresence(roomId).set(identity.id, identity);
}

function addUserSocket(socket) {
  const userId = socket.data.authUser?._id?.toString();
  if (!userId) return;

  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }

  userSockets.get(userId).add(socket.id);
}

function removeUserSocket(socket) {
  const userId = socket.data.authUser?._id?.toString();
  if (!userId) return;

  const sockets = userSockets.get(userId);
  if (!sockets) return;

  sockets.delete(socket.id);
  if (sockets.size === 0) {
    userSockets.delete(userId);
  }
}

function emitToUser(io, userId, eventName, payload) {
  const sockets = userSockets.get(userId?.toString());
  if (!sockets || sockets.size === 0) return false;

  for (const socketId of sockets) {
    io.to(socketId).emit(eventName, payload);
  }

  return true;
}

function removePresence(roomId, socketId) {
  const bucket = roomPresence.get(roomId);
  if (!bucket) return;
  bucket.delete(socketId);

  if (bucket.size === 0) {
    roomPresence.delete(roomId);
  }
}

function rateLimitEvent(socket, eventName, limit = 60, windowMs = 60_000) {
  const scope = `${socket.id}:${eventName}`;
  const now = Date.now();
  const bucket = eventLimits.get(scope) || [];
  const recent = bucket.filter((timestamp) => now - timestamp < windowMs);

  if (recent.length >= limit) {
    return false;
  }

  recent.push(now);
  eventLimits.set(scope, recent);
  return true;
}

function requireRoom(socket) {
  if (!socket.data.room) {
    socket.emit("operation:error", { message: "Join a room before editing the board." });
    return null;
  }

  return socket.data.room;
}

async function requireEditAccess(socket) {
  const room = requireRoom(socket);
  if (!room) return null;

  const liveRole = await getRoomRoleLive(room._id, socket.data.authUser._id);

  if (!canEditRoom(liveRole)) {
    socket.emit("operation:error", { message: "You only have view access in this room." });
    return null;
  }

  socket.data.roomRole = liveRole;
  return room;
}

function emitRoomMembershipRefresh(io, roomId) {
  io.to(roomId.toString()).emit("room:members-updated", { roomId: roomId.toString() });
}

function applyValidation(socket, schema, payload, eventName) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    socket.emit("operation:error", {
      event: eventName,
      message: "Validation failed.",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
    return null;
  }

  return parsed.data;
}

async function joinRoom(socket, roomKey) {
  const room = await Room.findOne(buildRoomLookup(roomKey));

  if (!room) {
    socket.emit("operation:error", { event: "room:join", message: "Room not found." });
    return;
  }

  const role = getRoomRole(room, socket.data.authUser._id);
  if (!role) {
    socket.emit("operation:error", { event: "room:join", message: "You do not have access to that room." });
    return;
  }

  const previousRoomId = socket.data.room?._id?.toString();
  const nextRoomId = room._id.toString();
  const identity = {
    id: socket.id,
    userId: socket.data.authUser._id.toString(),
    name: socket.data.authUser.name,
    color: socket.data.authUser.color,
    role,
  };

  if (previousRoomId && previousRoomId !== nextRoomId) {
    removePresence(previousRoomId, socket.id);
    socket.to(previousRoomId).emit("user:left", { id: socket.id });
    socket.leave(previousRoomId);
  }

  socket.join(nextRoomId);
  socket.data.room = room;
  socket.data.roomRole = role;
  socket.data.identity = identity;

  addPresence(nextRoomId, identity);

  const elements = await Element.find({ roomId: room._id }).sort({ createdAt: 1 }).lean();
  const users = listRoomUsers(nextRoomId);

  socket.emit("canvas:init", {
    self: identity,
    room: serializeRoom(room, socket.data.authUser._id),
    elements,
    users,
  });
  socket.to(nextRoomId).emit("user:joined", identity);
}

function registerSocketHandlers(io) {
  io.use(authenticateSocket);
  io.emitToUser = (userId, eventName, payload) => emitToUser(io, userId, eventName, payload);

  io.on("connection", async (socket) => {
    const guest = makeGuestIdentity();
    console.log(`+ ${socket.data.authUser?.name || guest.name} connected (${socket.id})`);
    addUserSocket(socket);

    socket.on("room:join", async (payload) => {
      if (!rateLimitEvent(socket, "room:join", 10, 60_000)) {
        socket.emit("operation:error", { event: "room:join", message: "Too many room switches. Please slow down." });
        return;
      }

      const parsed = applyValidation(socket, roomJoinSchema, payload, "room:join");
      if (!parsed) return;

      await joinRoom(socket, parsed.roomKey);
    });

    socket.on("cursor:move", (payload) => {
      if (!requireRoom(socket)) return;

      const parsed = applyValidation(socket, cursorMoveSchema, payload, "cursor:move");
      if (!parsed) return;

      socket.to(socket.data.room._id.toString()).emit("cursor:move", {
        id: socket.id,
        x: parsed.x,
        y: parsed.y,
        name: socket.data.authUser.name,
        color: socket.data.authUser.color,
      });
    });

    socket.on("stroke:start", async (payload) => {
      const room = await requireEditAccess(socket);
      if (!room) return;

      if (!rateLimitEvent(socket, "stroke:start", 120, 60_000)) {
        return;
      }

      const parsed = applyValidation(socket, strokeStartSchema, payload, "stroke:start");
      if (!parsed) return;

      socket.to(room._id.toString()).emit("stroke:start", { ...parsed, socketId: socket.id });
    });

    socket.on("stroke:point", async (payload) => {
      const room = await requireEditAccess(socket);
      if (!room) return;

      if (!rateLimitEvent(socket, "stroke:point", 360, 60_000)) {
        return;
      }

      const parsed = applyValidation(socket, strokePointSchema, payload, "stroke:point");
      if (!parsed) return;

      socket.to(room._id.toString()).emit("stroke:point", { ...parsed, socketId: socket.id });
    });

    socket.on("stroke:end", async (payload) => {
      const room = await requireEditAccess(socket);
      if (!room) return;

      if (!rateLimitEvent(socket, "stroke:end", 60, 60_000)) {
        return;
      }

      const parsed = applyValidation(socket, strokeEndSchema, payload, "stroke:end");
      if (!parsed) return;

      try {
        const element = await Element.create({
          clientId: parsed.clientId,
          roomId: room._id,
          type: "stroke",
          data: { points: parsed.points, color: parsed.color, width: parsed.width },
          createdBy: socket.data.authUser.name,
          createdById: socket.data.authUser._id,
        });

        socket.to(room._id.toString()).emit("stroke:end", { ...parsed, socketId: socket.id });
        socket.to(room._id.toString()).emit("element:add", element);
      } catch (err) {
        if (err.code !== 11000) {
          console.error("stroke:end error", err);
        }
      }
    });

    socket.on("element:add", async (payload) => {
      const room = await requireEditAccess(socket);
      if (!room) return;

      if (!rateLimitEvent(socket, "element:add", 120, 60_000)) {
        return;
      }

      const parsed = applyValidation(socket, elementCreateSchema, payload, "element:add");
      if (!parsed) return;

      try {
        const element = await Element.create({
          clientId: parsed.clientId,
          roomId: room._id,
          type: parsed.type,
          data: parsed.data,
          createdBy: socket.data.authUser.name,
          createdById: socket.data.authUser._id,
        });

        socket.to(room._id.toString()).emit("element:add", element);
      } catch (err) {
        if (err.code !== 11000) {
          console.error("element:add error", err);
        }
      }
    });

    socket.on("element:update", async (payload) => {
      const room = await requireEditAccess(socket);
      if (!room) return;

      if (!rateLimitEvent(socket, "element:update", 180, 60_000)) {
        return;
      }

      const parsed = applyValidation(socket, elementUpdateSchema, payload, "element:update");
      if (!parsed) return;

      try {
        const updated = await Element.findOneAndUpdate(
          { clientId: parsed.clientId, roomId: room._id },
          { $set: { data: parsed.data } },
          { new: true }
        ).lean();

        if (updated) {
          socket.to(room._id.toString()).emit("element:update", updated);
        }
      } catch (err) {
        console.error("element:update error", err);
      }
    });

    socket.on("element:delete", async (payload) => {
      const room = await requireEditAccess(socket);
      if (!room) return;

      if (!rateLimitEvent(socket, "element:delete", 120, 60_000)) {
        return;
      }

      const parsed = applyValidation(socket, elementDeleteSchema, payload, "element:delete");
      if (!parsed) return;

      try {
        await Element.deleteOne({ clientId: parsed.clientId, roomId: room._id });
        socket.to(room._id.toString()).emit("element:delete", { clientId: parsed.clientId });
      } catch (err) {
        console.error("element:delete error", err);
      }
    });

    socket.on("canvas:clear", async () => {
      const room = await requireEditAccess(socket);
      if (!room) return;

      if (!rateLimitEvent(socket, "canvas:clear", 20, 60_000)) {
        return;
      }

      try {
        await Element.deleteMany({ roomId: room._id });
        io.to(room._id.toString()).emit("canvas:clear");
      } catch (err) {
        console.error("canvas:clear error", err);
      }
    });

    socket.on("disconnect", () => {
      removeUserSocket(socket);

      const roomId = socket.data.room?._id?.toString();
      if (roomId) {
        removePresence(roomId, socket.id);
        socket.to(roomId).emit("user:left", { id: socket.id });
      }

      console.log(`- ${socket.data.authUser?.name || guest.name} disconnected (${socket.id})`);
    });
  });
}

module.exports = registerSocketHandlers;

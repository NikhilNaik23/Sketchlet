const User = require("../models/User");
const { comparePassword, hashPassword, serializeUser, signToken } = require("../utils/auth");
const { serializeRoom } = require("../utils/rooms");
const { createRoom, listRoomsForUser } = require("./roomService");

async function loadAuthResponse(userId) {
  const user = await User.findById(userId).lean();
  const rooms = await listRoomsForUser(userId);

  return {
    user: serializeUser(user),
    rooms,
    primaryRoom: rooms[0] || null,
  };
}

async function registerUser({ name, email, password }) {
  const existing = await User.findOne({ email }).lean();

  if (existing) {
    const error = new Error("A user with that email already exists.");
    error.statusCode = 409;
    throw error;
  }

  const user = await User.create({
    name,
    email,
    passwordHash: await hashPassword(password),
  });

  const room = await createRoom(`${name}'s board`, user._id);

  return {
    token: signToken(user),
    ...(await loadAuthResponse(user._id)),
    primaryRoom: serializeRoom(room, user._id),
  };
}

async function loginUser({ email, password }) {
  const user = await User.findOne({ email }).select("+passwordHash");

  if (!user) {
    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    throw error;
  }

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) {
    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    throw error;
  }

  return {
    token: signToken(user),
    ...(await loadAuthResponse(user._id)),
  };
}

module.exports = {
  loadAuthResponse,
  loginUser,
  registerUser,
};
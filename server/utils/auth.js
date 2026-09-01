const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

function requireJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set. Add it to server/.env before starting the app.");
  }

  return process.env.JWT_SECRET;
}

function getTokenFromHeader(header) {
  if (!header || typeof header !== "string") return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email }, requireJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function verifyToken(token) {
  return jwt.verify(token, requireJwtSecret());
}

function serializeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    color: user.color,
  };
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

async function requireAuth(req, res, next) {
  try {
    const token = getTokenFromHeader(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: "Missing bearer token." });
    }

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).lean();

    if (!user) {
      return res.status(401).json({ error: "Invalid auth token." });
    }

    req.authUser = user;
    req.authToken = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized." });
  }
}

async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth?.token || getTokenFromHeader(socket.handshake.headers?.authorization);

    if (!token) {
      return next(new Error("Unauthorized"));
    }

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).lean();

    if (!user) {
      return next(new Error("Unauthorized"));
    }

    socket.data.authUser = user;
    next();
  } catch (err) {
    next(new Error("Unauthorized"));
  }
}

module.exports = {
  authenticateSocket,
  comparePassword,
  getTokenFromHeader,
  hashPassword,
  requireAuth,
  serializeUser,
  signToken,
  verifyToken,
};
const crypto = require("crypto");
const mongoose = require("mongoose");

const ROLES = {
  OWNER: "owner",
  EDITOR: "editor",
  VIEWER: "viewer",
};

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28) || "room";
}

function generateRoomSlug(name) {
  return `${slugify(name)}-${crypto.randomBytes(3).toString("hex")}`;
}

function buildRoomLookup(roomKey) {
  if (mongoose.Types.ObjectId.isValid(roomKey)) {
    return { $or: [{ _id: roomKey }, { slug: roomKey }, { name: roomKey }] };
  }

  return {
    $or: [
      { slug: roomKey },
      { name: roomKey },
      { name: new RegExp(`^${escapeRegExp(roomKey)}$`, "i") },
    ],
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getRoomMember(room, userId) {
  return room?.members?.find((member) => member.userId?.toString() === userId?.toString()) || null;
}

function getRoomRole(room, userId) {
  return getRoomMember(room, userId)?.role || null;
}

function canEditRoom(role) {
  return role === ROLES.OWNER || role === ROLES.EDITOR;
}

function canManageRoom(role) {
  return role === ROLES.OWNER;
}

function serializeRoom(room, userId) {
  if (!room) return null;

  const role = userId ? getRoomRole(room, userId) : null;

  return {
    id: room._id.toString(),
    name: room.name,
    slug: room.slug,
    role,
    isMember: Boolean(role),
    isOwner: role === ROLES.OWNER,
  };
}

module.exports = {
  ROLES,
  canEditRoom,
  canManageRoom,
  buildRoomLookup,
  generateRoomSlug,
  getRoomMember,
  getRoomRole,
  serializeRoom,
};
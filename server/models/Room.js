const mongoose = require("mongoose");
const { Schema } = mongoose;

const RoomMemberSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["owner", "editor", "viewer"],
      required: true,
    },
  },
  { _id: false }
);

const RoomJoinRequestSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const RoomSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    nameLower: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
      index: true,
      select: false,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    members: {
      type: [RoomMemberSchema],
      default: [],
    },
    joinRequests: {
      type: [RoomJoinRequestSchema],
      default: [],
    },
  },
  { timestamps: true }
);

RoomSchema.index({ "members.userId": 1 });

module.exports = mongoose.model("Room", RoomSchema);
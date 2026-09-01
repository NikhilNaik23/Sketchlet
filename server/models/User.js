const mongoose = require("mongoose");
const { Schema } = mongoose;

const COLORS = ["#0F766E", "#2563EB", "#DB2777", "#7C3AED", "#EA580C", "#15803D", "#B45309"];

function pickColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    color: {
      type: String,
      default: pickColor,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
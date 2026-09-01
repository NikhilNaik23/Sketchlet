const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * A single element on the shared whiteboard.
 *
 * `type` determines how `data` should be interpreted by the client:
 *  - "stroke": { points: [{x,y}, ...], color, width }
 *  - "rect":   { x, y, w, h, color, strokeWidth }
 *  - "ellipse":{ x, y, w, h, color, strokeWidth }
 *  - "line":   { x1, y1, x2, y2, color, strokeWidth }
 *  - "note":   { x, y, w, h, text, color }
 *
 * We intentionally keep `data` as a flexible Mixed object rather than
 * modeling every shape type individually, since the client is the source
 * of truth for how to render each type and this keeps the schema simple
 * to extend (e.g. adding a "text" or "image" type later).
 */
const ElementSchema = new Schema(
  {
    clientId: {
      // id generated on the client so we can reconcile optimistic updates
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["stroke", "rect", "ellipse", "line", "note"],
      required: true,
    },
    roomId: {
      type: Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
    },
    createdBy: {
      // ephemeral session name, e.g. "Amber Fox" — not a real user account
      type: String,
      default: "Anonymous",
    },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Element", ElementSchema);

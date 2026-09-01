const { z } = require("zod");

const authRegisterSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

const authLoginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

const roomCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
});

const roomJoinSchema = z.object({
  roomKey: z.string().trim().min(3).max(80),
});

const roomRoleSchema = z.enum(["owner", "editor", "viewer"]);

const roomMemberUpdateSchema = z.object({
  role: roomRoleSchema,
});

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const strokeDataSchema = z.object({
  points: z.array(pointSchema).min(1).max(4000),
  color: z.string().trim().min(1).max(32),
  width: z.number().positive().max(50),
});

const rectDataSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite(),
  h: z.number().finite(),
  color: z.string().trim().min(1).max(32),
  strokeWidth: z.number().positive().max(20),
});

const lineDataSchema = z.object({
  x1: z.number().finite(),
  y1: z.number().finite(),
  x2: z.number().finite(),
  y2: z.number().finite(),
  color: z.string().trim().min(1).max(32),
  strokeWidth: z.number().positive().max(20),
});

const noteDataSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite(),
  h: z.number().finite(),
  text: z.string().max(5000).default(""),
  color: z.string().trim().min(1).max(32),
});

const shapeCommonSchema = z.object({
  clientId: z.string().trim().min(4).max(120),
});

const elementCreateSchema = z.discriminatedUnion("type", [
  shapeCommonSchema.extend({ type: z.literal("stroke"), data: strokeDataSchema }),
  shapeCommonSchema.extend({ type: z.literal("rect"), data: rectDataSchema }),
  shapeCommonSchema.extend({ type: z.literal("ellipse"), data: rectDataSchema }),
  shapeCommonSchema.extend({ type: z.literal("line"), data: lineDataSchema }),
  shapeCommonSchema.extend({ type: z.literal("note"), data: noteDataSchema }),
]);

const strokeStartSchema = z.object({
  clientId: z.string().trim().min(4).max(120),
  x: z.number().finite(),
  y: z.number().finite(),
  color: z.string().trim().min(1).max(32),
  width: z.number().positive().max(50),
});

const strokePointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const strokeEndSchema = strokeDataSchema.extend({
  clientId: z.string().trim().min(4).max(120),
});

const elementUpdateSchema = z.object({
  clientId: z.string().trim().min(4).max(120),
  data: z.object({}).passthrough(),
});

const elementDeleteSchema = z.object({
  clientId: z.string().trim().min(4).max(120),
});

const cursorMoveSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

module.exports = {
  authLoginSchema,
  authRegisterSchema,
  cursorMoveSchema,
  elementCreateSchema,
  elementDeleteSchema,
  elementUpdateSchema,
  noteDataSchema,
  rectDataSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomMemberUpdateSchema,
  roomRoleSchema,
  strokeEndSchema,
  strokePointSchema,
  strokeStartSchema,
};
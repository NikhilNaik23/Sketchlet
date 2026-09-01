require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const createApp = require("./app");
const registerSocketHandlers = require("./socket/handlers");

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

async function main() {
  await connectDB();

  const app = createApp(CLIENT_ORIGIN);
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: { origin: CLIENT_ORIGIN.split(","), methods: ["GET", "POST", "PATCH"] },
  });

  app.set("io", io);

  registerSocketHandlers(io);

  server.listen(PORT, () => {
    console.log(`Sketchlet server listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const apiRoutes = require("./routes");

function createApp(clientOrigin) {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: clientOrigin.split(","), credentials: true }));
  app.use(express.json({ limit: "2mb" }));

  app.use("/api", apiRoutes);

  app.use((err, req, res, next) => {
    console.error(err);
    return res.status(err.statusCode || 500).json({ error: err.message || "Internal server error." });
  });

  return app;
}

module.exports = createApp;
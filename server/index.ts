import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createAccessMiddleware } from "./auth.js";
import {
  createDepartmentAccessRouter,
  createDepartmentApiMiddleware,
} from "./department-access.js";
import { initDb } from "./db.js";
import routes from "./routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  await initDb();

  const app = express();
  const server = createServer(app);

  // Render needs an unauthenticated liveness probe. It exposes no application
  // data and must stay before the access middleware.
  app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));
  app.use(createAccessMiddleware());
  app.use(express.json());
  app.use(createDepartmentAccessRouter());
  app.use(createDepartmentApiMiddleware());

  // API routes
  app.use(routes);

  // Serve static files in production
  if (process.env.NODE_ENV === "production") {
    const staticPath = path.resolve(__dirname, "public");
    app.use(express.static(staticPath));

    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  }

  const port =
    process.env.PORT || (process.env.NODE_ENV === "production" ? 3000 : 3501);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

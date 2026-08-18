import 'dotenv/config';
import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { initDb } from "./db.js";
import routes, { UPLOADS_DIR } from "./routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  await initDb();

  const app = express();
  const server = createServer(app);

  app.use(express.json());

  // Under /api so the Vite dev proxy (which only forwards /api) reaches it too.
  app.use("/api/uploads", express.static(UPLOADS_DIR));

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

  const port = process.env.PORT || (process.env.NODE_ENV === "production" ? 3000 : 3501);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

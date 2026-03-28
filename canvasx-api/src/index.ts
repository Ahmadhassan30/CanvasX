import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import agentRoute from "./routes/agent.ts";

const PORT = Number(process.env.PORT ?? 3001);

const app = new Hono();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Type"],
    maxAge: 600,
    credentials: false,
  })
);

// ─── Routes ──────────────────────────────────────────────────────────────────

app.route("/api/agent", agentRoute);

// Root probe — useful for container health checks
app.get("/", (c) =>
  c.json({
    name: "canvasx-api",
    version: "1.0.0",
    docs: "/api/agent/health",
  })
);

// 404 fallback
app.notFound((c) =>
  c.json({ error: "Not found", path: c.req.path }, 404)
);

// Unhandled error boundary
app.onError((err, c) => {
  console.error("[server] unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// ─── Start ───────────────────────────────────────────────────────────────────

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`\n🚀 canvasx-api running on http://localhost:${info.port}`);
  console.log(`   POST http://localhost:${info.port}/api/agent/generate`);
  console.log(`   GET  http://localhost:${info.port}/api/agent/health\n`);
});

export default app;

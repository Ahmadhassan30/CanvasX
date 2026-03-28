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
    // Expose X-Cache so the browser can read cache-hit headers
    exposeHeaders: ["Content-Type", "X-Cache"],
    maxAge: 600,
    credentials: false,
  })
);

// ─── Routes ──────────────────────────────────────────────────────────────────

app.route("/api/agent", agentRoute);

// Root probe
app.get("/", (c) =>
  c.json({
    name: "canvasx-api",
    version: "1.0.0",
    endpoints: {
      generate: "POST /api/agent/generate",
      health: "GET  /api/agent/health",
    },
  })
);

// 404 fallback
app.notFound((c) =>
  c.json({ error: "Not found", path: c.req.path }, 404)
);

// Global error boundary
app.onError((err, c) => {
  console.error("[server] unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// ─── Start ───────────────────────────────────────────────────────────────────

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`\n🚀  canvasx-api  →  http://localhost:${info.port}`);
  console.log(`    POST  /api/agent/generate   (SSE streaming)`);
  console.log(`    GET   /api/agent/health     (liveness + cache stats)\n`);
});

export default app;

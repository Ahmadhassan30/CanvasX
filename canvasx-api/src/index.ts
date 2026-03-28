import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import agentRoute from "./routes/agent.ts";
import mockRoute from "./routes/mock.ts";

// ─── Startup validation ───────────────────────────────────────────────────────

const IS_MOCK =
  process.env.CANVASX_MOCK === "true" || !process.env.GROQ_API_KEY;

if (!process.env.GROQ_API_KEY) {
  if (IS_MOCK) {
    console.warn(
      "\n⚠️  GROQ_API_KEY is not set — starting in MOCK MODE.\n" +
        "   The /api/agent/generate endpoint will return sample elements.\n" +
        "   Set GROQ_API_KEY in canvasx-api/.env to enable real generation.\n",
    );
  } else {
    console.error(
      "\n❌  GROQ_API_KEY is required but was not found.\n" +
        "   Create canvasx-api/.env and add:\n\n" +
        "       GROQ_API_KEY=gsk_...\n\n" +
        "   Or run in mock mode:\n\n" +
        "       CANVASX_MOCK=true bun run src/index.ts\n",
    );
    process.exit(1);
  }
}

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
    exposeHeaders: ["Content-Type", "X-Cache", "X-Mock"],
    maxAge: 600,
    credentials: false,
  }),
);

// ─── Routes ──────────────────────────────────────────────────────────────────

// In mock mode, override /api/agent with the lightweight mock handler
if (IS_MOCK) {
  app.route("/api/agent", mockRoute);
} else {
  app.route("/api/agent", agentRoute);
}

// Root probe
app.get("/", (c) =>
  c.json({
    name: "canvasx-api",
    version: "1.0.0",
    mode: IS_MOCK ? "mock" : "live",
    endpoints: {
      generate: "POST /api/agent/generate",
      health: "GET  /api/agent/health",
    },
  }),
);

// 404 fallback
app.notFound((c) => c.json({ error: "Not found", path: c.req.path }, 404));

// Global error boundary
app.onError((err, c) => {
  console.error("[server] unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// ─── Start ───────────────────────────────────────────────────────────────────

serve({ fetch: app.fetch, port: PORT }, (info) => {
  const mode = IS_MOCK ? "🟡 MOCK" : "🟢 LIVE";
  console.log(`\n🚀  canvasx-api [${mode}]  →  http://localhost:${info.port}`);
  console.log(`    POST  /api/agent/generate   (SSE streaming)`);
  console.log(`    GET   /api/agent/health     (liveness + cache stats)\n`);
});

export default app;

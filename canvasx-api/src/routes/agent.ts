import { Hono } from "hono";
import { stream } from "hono/streaming";
import { agentGraph } from "../agent/graph.ts";
import { get, set, hashKey } from "../cache/index.ts";
import type { ExcalidrawElement } from "../types/excalidraw.ts";

const agent = new Hono();

interface GenerateRequest {
  prompt: string;
}

interface GenerateResponse {
  elements: ExcalidrawElement[];
  cached: boolean;
  validationErrors: string[];
  retryCount: number;
}

/**
 * POST /api/agent/generate
 *
 * Accepts a JSON body: { "prompt": string }
 *
 * Streams progress events as SSE before returning the final payload.
 * Results are cached by SHA-256(prompt) for 1 hour.
 */
agent.post("/generate", async (c) => {
  let body: GenerateRequest;

  try {
    body = await c.req.json<GenerateRequest>();
  } catch {
    return c.json({ error: "Request body must be valid JSON with a 'prompt' field." }, 400);
  }

  const { prompt } = body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return c.json({ error: "'prompt' must be a non-empty string." }, 400);
  }

  if (prompt.trim().length > 4000) {
    return c.json({ error: "'prompt' must be ≤ 4000 characters." }, 400);
  }

  const cacheKey = hashKey(prompt.trim());
  const cached = get<GenerateResponse>(cacheKey);

  if (cached) {
    return c.json({ ...cached, cached: true });
  }

  // Stream SSE progress events while the graph runs
  return stream(c, async (s) => {
    const sendEvent = async (event: string, data: unknown) => {
      await s.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    await sendEvent("progress", { step: "analyze", message: "Analyzing your prompt…" });

    let finalState: Awaited<ReturnType<typeof agentGraph.invoke>>;

    try {
      finalState = await agentGraph.invoke(
        { userPrompt: prompt.trim() },
        { recursionLimit: 12 }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await sendEvent("error", { message });
      return;
    }

    if (finalState.error) {
      await sendEvent("error", { message: finalState.error });
      return;
    }

    if (!finalState.isValid) {
      await sendEvent("error", {
        message: "Generated diagram failed validation.",
        validationErrors: finalState.validationErrors,
      });
      return;
    }

    const result: GenerateResponse = {
      elements: finalState.elements,
      cached: false,
      validationErrors: finalState.validationErrors,
      retryCount: finalState.retryCount,
    };

    set(cacheKey, result);

    await sendEvent("complete", result);
  });
});

/**
 * GET /api/health
 * Lightweight liveness probe — no auth required.
 */
agent.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "canvasx-api",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "development",
  });
});

export default agent;

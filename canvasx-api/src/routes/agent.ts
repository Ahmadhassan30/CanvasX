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
  diagramType: string | null;
  topic: string;
  cached: boolean;
  isValid: boolean;
  iterationCount: number;
  validationErrors: string[];
  streamChunks: string[];
}

/**
 * POST /api/agent/generate
 *
 * Body: { "prompt": string }
 *
 * Streams SSE progress events while the LangGraph pipeline runs.
 * Events:
 *   event: progress  — intermediate log lines from each node
 *   event: complete  — final GenerateResponse payload
 *   event: error     — error message string
 *
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
    return c.json({ error: "'prompt' must be ≤ 4 000 characters." }, 400);
  }

  const cacheKey = hashKey(prompt.trim());
  const cached = get<GenerateResponse>(cacheKey);
  if (cached) {
    return c.json({ ...cached, cached: true });
  }

  return stream(c, async (s) => {
    const sendEvent = async (event: string, data: unknown) => {
      await s.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    await sendEvent("progress", { step: "start", message: "Pipeline starting…" });

    let finalState: Awaited<ReturnType<typeof agentGraph.invoke>>;
    try {
      finalState = await agentGraph.invoke(
        { input: prompt.trim() },
        { recursionLimit: 20 }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await sendEvent("error", { message });
      return;
    }

    // Stream the accumulated log chunks to the client
    for (const chunk of finalState.streamChunks ?? []) {
      await sendEvent("progress", { message: chunk });
    }

    const elements: ExcalidrawElement[] =
      finalState.finalElements?.length
        ? finalState.finalElements
        : finalState.generatedElements ?? [];

    const result: GenerateResponse = {
      elements,
      diagramType: finalState.diagramType ?? null,
      topic: finalState.topic ?? "",
      cached: false,
      isValid: finalState.isValid ?? false,
      iterationCount: finalState.iterationCount ?? 0,
      validationErrors: finalState.validationErrors ?? [],
      streamChunks: finalState.streamChunks ?? [],
    };

    if (result.elements.length > 0) {
      set(cacheKey, result);
    }

    await sendEvent("complete", result);
  });
});

/**
 * GET /api/agent/health
 * Liveness probe — returns service status.
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

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { agentGraph } from "../agent/graph.ts";
import { get, set, hashKey, size as cacheSize } from "../cache/index.ts";
import type { ExcalidrawElement, PartialAppState } from "../types/excalidraw.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GenerateRequest {
  input: string;
  mode?: "mindmap" | "flowchart" | "studynotes" | "timeline" | "comparison";
  sessionId?: string;
}

interface StatusEvent {
  stage: "analyzing" | "planning" | "generating" | "validating" | "refining";
  message: string;
}

interface ElementsEvent {
  elements: ExcalidrawElement[];
  appState: PartialAppState;
}

interface DoneEvent {
  success: boolean;
  elementCount: number;
  cached: boolean;
  iterationCount: number;
  diagramType: string | null;
  topic: string;
}

interface ErrorEvent {
  message: string;
}

interface CachedPayload {
  elements: ExcalidrawElement[];
  diagramType: string | null;
  topic: string;
  iterationCount: number;
}

// ─── App state template injected with every elements event ────────────────────

const BASE_APP_STATE: PartialAppState = {
  viewBackgroundColor: "#ffffff",
  currentItemStrokeColor: "#1e1e1e",
  zoom: { value: 1 },
  scrollX: 0,
  scrollY: 0,
};

// ─── LangGraph stage → SSE stage mapping ─────────────────────────────────────
// streamChunks lines are prefixed with "[<nodeName>]" — we detect the stage
// from these prefixes so we can emit granular status events during streaming.

const CHUNK_TO_STAGE: Record<string, StatusEvent["stage"]> = {
  "[analyze]": "analyzing",
  "[plan]": "planning",
  "[generate]": "generating",
  "[validate]": "validating",
  "[refine]": "refining",
};

function chunkToStage(chunk: string): StatusEvent["stage"] {
  for (const [prefix, stage] of Object.entries(CHUNK_TO_STAGE)) {
    if (chunk.includes(prefix)) return stage;
  }
  return "generating";
}

// ─── JSON extraction fallback ─────────────────────────────────────────────────
// Used when the LLM wraps JSON in prose. Extracts the first top-level
// array or object using a greedy bracket-matching scan.

function extractJson(raw: string): string | null {
  const startArray = raw.indexOf("[");
  const startObj = raw.indexOf("{");
  if (startArray === -1 && startObj === -1) return null;

  let start: number;
  let open: string;
  let close: string;

  if (startArray === -1 || (startObj !== -1 && startObj < startArray)) {
    start = startObj;
    open = "{";
    close = "}";
  } else {
    start = startArray;
    open = "[";
    close = "]";
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

// ─── Route ────────────────────────────────────────────────────────────────────

const agent = new Hono();

/**
 * POST /api/agent/generate
 *
 * Accepts: { input: string, mode?: string, sessionId?: string }
 *
 * Streams SSE events:
 *   event: status   → { stage, message }
 *   event: elements → { elements, appState }
 *   event: done     → { success, elementCount, cached, ... }
 *   event: error    → { message }
 */
agent.post("/generate", async (c) => {
  // ── Validate body ─────────────────────────────────────────────────────────
  let body: GenerateRequest;
  try {
    body = await c.req.json<GenerateRequest>();
  } catch {
    return c.json({ error: "Request body must be valid JSON." }, 400);
  }

  const { input, mode } = body;

  if (!input || typeof input !== "string" || input.trim().length === 0) {
    return c.json({ error: "'input' must be a non-empty string." }, 400);
  }
  if (input.trim().length > 4_000) {
    return c.json({ error: "'input' must be ≤ 4 000 characters." }, 400);
  }

  // ── Cache check ───────────────────────────────────────────────────────────
  const cacheKey = hashKey(input.trim() + (mode ?? ""));
  const cached = get<CachedPayload>(cacheKey);

  if (cached) {
    // Cache hit: respond as a regular JSON response with X-Cache header.
    // We still wrap it in SSE so the client code path is identical.
    c.header("X-Cache", "HIT");
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: "status",
        data: JSON.stringify<StatusEvent>({
          stage: "generating",
          message: "Cache hit — serving stored result",
        }),
      });
      await stream.writeSSE({
        event: "elements",
        data: JSON.stringify<ElementsEvent>({
          elements: cached.elements,
          appState: BASE_APP_STATE,
        }),
      });
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify<DoneEvent>({
          success: true,
          elementCount: cached.elements.length,
          cached: true,
          iterationCount: cached.iterationCount,
          diagramType: cached.diagramType,
          topic: cached.topic,
        }),
      });
    });
  }

  // ── Cache miss: invoke LangGraph with 30-second timeout ──────────────────
  return streamSSE(c, async (stream) => {
    const sendStatus = (stage: StatusEvent["stage"], message: string) =>
      stream.writeSSE({
        event: "status",
        data: JSON.stringify<StatusEvent>({ stage, message }),
      });

    const sendError = (message: string) =>
      stream.writeSSE({
        event: "error",
        data: JSON.stringify<ErrorEvent>({ message }),
      });

    await sendStatus("analyzing", "Starting pipeline…");

    // 30-second hard timeout
    const timeoutSignal = AbortSignal.timeout(30_000);
    let timedOut = false;

    const timeoutHandle = setTimeout(async () => {
      timedOut = true;
      await sendError("Request timed out after 30 seconds.");
    }, 30_000);

    let finalState: Awaited<ReturnType<typeof agentGraph.invoke>>;

    try {
      finalState = await agentGraph.invoke(
        {
          input: input.trim(),
          // If the caller specified a mode, pass it as a hint via the
          // diagramType field — the analyze node may override it.
          ...(mode ? { diagramType: mode } : {}),
        },
        { recursionLimit: 20, signal: timeoutSignal }
      );
    } catch (err: unknown) {
      clearTimeout(timeoutHandle);
      if (timedOut) return; // already sent timeout event above
      const message = err instanceof Error ? err.message : String(err);
      console.error("[route/generate] agentGraph.invoke error:", message);

      // Retry once on Groq API errors
      if (message.toLowerCase().includes("groq") || message.toLowerCase().includes("rate")) {
        await sendStatus("generating", "Groq API error — retrying once…");
        try {
          finalState = await agentGraph.invoke(
            { input: input.trim(), ...(mode ? { diagramType: mode } : {}) },
            { recursionLimit: 20 }
          );
        } catch (retryErr: unknown) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          await sendError(`Pipeline failed after retry: ${retryMsg}`);
          return;
        }
      } else {
        await sendError(`Pipeline error: ${message}`);
        return;
      }
    }

    clearTimeout(timeoutHandle);
    if (timedOut) return;

    // ── Stream node progress as status events ─────────────────────────────
    for (const chunk of finalState.streamChunks ?? []) {
      await sendStatus(chunkToStage(chunk), chunk);
    }

    // ── Resolve final elements ─────────────────────────────────────────────
    let elements: ExcalidrawElement[] =
      finalState.finalElements?.length
        ? finalState.finalElements
        : finalState.generatedElements ?? [];

    // JSON extraction fallback: if elements is empty but LLM raw output
    // exists (edge case), attempt bracket-scan extraction.
    if (elements.length === 0) {
      const lastChunk = (finalState.streamChunks ?? [])
        .filter((c: string) => c.includes("[generate]"))
        .at(-1);
      if (lastChunk) {
        const extracted = extractJson(lastChunk);
        if (extracted) {
          try {
            const parsed = JSON.parse(extracted);
            if (Array.isArray(parsed) && parsed.length > 0) {
              elements = parsed as ExcalidrawElement[];
              console.log(`[route/generate] Recovered ${elements.length} elements via regex extraction`);
            }
          } catch {
            // extraction produced invalid JSON — leave elements empty
          }
        }
      }
    }

    const success = elements.length > 0;

    // ── Send elements event ────────────────────────────────────────────────
    if (success) {
      await stream.writeSSE({
        event: "elements",
        data: JSON.stringify<ElementsEvent>({
          elements,
          appState: BASE_APP_STATE,
        }),
      });

      // Cache the result
      set<CachedPayload>(cacheKey, {
        elements,
        diagramType: finalState.diagramType ?? null,
        topic: finalState.topic ?? "",
        iterationCount: finalState.iterationCount ?? 0,
      });
    } else {
      await sendError(
        finalState.validationErrors?.length
          ? `Generation failed: ${finalState.validationErrors[0]}`
          : "No elements were generated. Please try a more specific prompt."
      );
    }

    // ── Done event ─────────────────────────────────────────────────────────
    await stream.writeSSE({
      event: "done",
      data: JSON.stringify<DoneEvent>({
        success,
        elementCount: elements.length,
        cached: false,
        iterationCount: finalState.iterationCount ?? 0,
        diagramType: finalState.diagramType ?? null,
        topic: finalState.topic ?? "",
      }),
    });
  });
});

/**
 * GET /api/agent/health
 */
agent.get("/health", (c) => {
  return c.json({
    status: "ok",
    model: "llama-3.3-70b-versatile",
    cache: { size: cacheSize() },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default agent;

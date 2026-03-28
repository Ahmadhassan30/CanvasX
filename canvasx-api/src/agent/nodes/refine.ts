import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentState } from "../state.ts";
import type { ExcalidrawElement } from "../../types/excalidraw.ts";
import { REFINE_PROMPT } from "../prompts.ts";

const llm = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0.2,
  maxTokens: 8192,
  apiKey: process.env.GROQ_API_KEY,
});

/** Strip markdown code fences that the LLM occasionally wraps output in. */
function stripFence(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

/**
 * Node 5 — Refine
 * Called only when validate reports errors and iterationCount < MAX_ITERATIONS.
 * Sends the broken elements + error list to the LLM for targeted repair,
 * then routes back to validateNode for re-inspection.
 */
export async function refineNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const ts = new Date().toISOString();
  console.log(
    `[${ts}] [refine] start — iteration=${state.iterationCount} ` +
      `errors=${state.validationErrors.length}`
  );

  const userMsg = JSON.stringify(
    {
      elements: state.generatedElements,
      validationErrors: state.validationErrors,
    },
    null,
    2
  );

  let raw: string;
  try {
    const response = await llm.invoke([
      new SystemMessage(REFINE_PROMPT),
      new HumanMessage(userMsg),
    ]);
    raw = stripFence((response.content as string).trim());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${ts}] [refine] LLM call failed: ${msg}`);
    return {
      // Keep the old elements unchanged and increment iteration so the loop exits
      iterationCount: 1,
      streamChunks: [`[refine] LLM error: ${msg} — passing existing elements to validate`],
    };
  }

  let refined: ExcalidrawElement[];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new TypeError(`Expected array, got ${typeof parsed}`);
    refined = parsed as ExcalidrawElement[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${ts}] [refine] JSON parse failed: ${msg}`);
    return {
      iterationCount: 1,
      streamChunks: [`[refine] Parse error: ${msg} — passing existing elements`],
    };
  }

  console.log(
    `[${ts}] [refine] done — refined ${refined.length} elements (was ${state.generatedElements.length})`
  );

  return {
    generatedElements: refined,
    iterationCount: 1,
    streamChunks: [`[refine] Refined to ${refined.length} elements (attempt ${state.iterationCount + 1})`],
  };
}

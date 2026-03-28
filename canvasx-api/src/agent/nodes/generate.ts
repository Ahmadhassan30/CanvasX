import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentState } from "../state.ts";
import type { ExcalidrawElement } from "../../types/excalidraw.ts";
import { GENERATE_PROMPT } from "../prompts.ts";

const llm = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0.3,
  // Increase max tokens to accommodate large element arrays
  maxTokens: 8192,
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Strips a markdown code fence if the LLM wrapped the JSON despite instructions.
 * Handles ```json ... ``` and ``` ... ``` patterns.
 */
function stripFence(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

/**
 * Node 3 — Generate
 * Converts the spatial layout plan into a flat array of Excalidraw elements.
 */
export async function generateNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const ts = new Date().toISOString();
  console.log(
    `[${ts}] [generate] start — iteration=${state.iterationCount} ` +
      `nodes=${state.plannedStructure?.nodes.length ?? 0}`
  );

  if (!state.plannedStructure) {
    console.error(`[${ts}] [generate] no plannedStructure in state`);
    return {
      generatedElements: [],
      streamChunks: ["[generate] No plan available — skipping generation."],
    };
  }

  const userMsg = JSON.stringify(state.plannedStructure, null, 2);

  let raw: string;
  try {
    const response = await llm.invoke([
      new SystemMessage(GENERATE_PROMPT),
      new HumanMessage(userMsg),
    ]);
    raw = stripFence((response.content as string).trim());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${ts}] [generate] LLM call failed: ${msg}`);
    return {
      generatedElements: [],
      streamChunks: [`[generate] LLM error: ${msg}`],
    };
  }

  let elements: ExcalidrawElement[];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new TypeError(`Expected JSON array, got ${typeof parsed}`);
    }
    elements = parsed as ExcalidrawElement[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${ts}] [generate] JSON parse failed: ${msg}. Preview: ${raw.slice(0, 300)}`);
    return {
      generatedElements: [],
      streamChunks: [`[generate] JSON parse error: ${msg}`],
    };
  }

  if (elements.length === 0) {
    console.error(`[${ts}] [generate] LLM returned empty array`);
    return {
      generatedElements: [],
      streamChunks: ["[generate] Empty elements array returned."],
    };
  }

  console.log(`[${ts}] [generate] done — ${elements.length} elements produced`);

  return {
    generatedElements: elements,
    streamChunks: [`[generate] Produced ${elements.length} elements`],
  };
}

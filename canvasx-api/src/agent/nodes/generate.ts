import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentState } from "../state.ts";
import type { ExcalidrawElement } from "../../types/excalidraw.ts";
import { GENERATE_SYSTEM_PROMPT } from "../prompts.ts";

const llm = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0.1,
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Node 3 — Generate
 * Converts the spatial layout plan into a fully-formed Excalidraw elements array.
 * Uses a low temperature to maximise JSON correctness.
 */
export async function generateNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  if (!state.plan) {
    return { error: "generate: received null plan — cannot generate elements." };
  }

  const response = await llm.invoke([
    new SystemMessage(GENERATE_SYSTEM_PROMPT),
    new HumanMessage(JSON.stringify(state.plan, null, 2)),
  ]);

  const raw = (response.content as string).trim();

  let elements: ExcalidrawElement[];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return {
        error: `generate: expected a JSON array but received ${typeof parsed}. Preview: ${raw.slice(0, 200)}`,
      };
    }
    elements = parsed as ExcalidrawElement[];
  } catch {
    return {
      error: `generate: failed to parse LLM response as JSON. Raw: ${raw.slice(0, 200)}`,
    };
  }

  if (elements.length === 0) {
    return { error: "generate: LLM produced an empty elements array." };
  }

  return { elements };
}

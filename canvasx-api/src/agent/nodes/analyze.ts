import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentState } from "../state.ts";
import { ANALYZE_SYSTEM_PROMPT } from "../prompts.ts";

const llm = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0.2,
  apiKey: process.env.GROQ_API_KEY,
});

type Analysis = AgentState["analysis"];

/**
 * Node 1 — Analyze
 * Converts the raw user prompt into a structured diagram intent object.
 * The LLM is constrained by ANALYZE_SYSTEM_PROMPT to return pure JSON.
 */
export async function analyzeNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const response = await llm.invoke([
    new SystemMessage(ANALYZE_SYSTEM_PROMPT),
    new HumanMessage(state.userPrompt),
  ]);

  const raw = (response.content as string).trim();

  let analysis: Analysis;
  try {
    analysis = JSON.parse(raw) as NonNullable<Analysis>;
  } catch {
    return {
      error: `analyze: failed to parse LLM response as JSON. Raw: ${raw.slice(0, 200)}`,
    };
  }

  if (
    !analysis ||
    typeof analysis.diagramType !== "string" ||
    !Array.isArray(analysis.entities) ||
    !Array.isArray(analysis.relationships)
  ) {
    return {
      error: "analyze: LLM returned an object that does not match the expected analysis schema.",
    };
  }

  return { analysis };
}

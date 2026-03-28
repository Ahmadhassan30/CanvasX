import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentState } from "../state.ts";
import { PLAN_SYSTEM_PROMPT } from "../prompts.ts";

const llm = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0.3,
  apiKey: process.env.GROQ_API_KEY,
});

type Plan = AgentState["plan"];

/**
 * Node 2 — Plan
 * Converts the structured analysis into a spatial layout plan (rows/cols grid).
 * The plan drives coordinate calculations in the generate node.
 */
export async function planNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  if (!state.analysis) {
    return { error: "plan: received null analysis — cannot produce a layout plan." };
  }

  const response = await llm.invoke([
    new SystemMessage(PLAN_SYSTEM_PROMPT),
    new HumanMessage(JSON.stringify(state.analysis, null, 2)),
  ]);

  const raw = (response.content as string).trim();

  let plan: Plan;
  try {
    plan = JSON.parse(raw) as NonNullable<Plan>;
  } catch {
    return {
      error: `plan: failed to parse LLM response as JSON. Raw: ${raw.slice(0, 200)}`,
    };
  }

  if (
    !plan ||
    !["horizontal", "vertical", "radial", "grid"].includes(plan.layout) ||
    !Array.isArray(plan.nodes) ||
    !Array.isArray(plan.edges)
  ) {
    return {
      error: "plan: LLM returned an object that does not match the expected plan schema.",
    };
  }

  if (plan.nodes.length === 0) {
    return { error: "plan: layout plan contains zero nodes — nothing to render." };
  }

  // Validate edge references to catch hallucinated node ids early
  const nodeIds = new Set(plan.nodes.map((n) => n.id));
  for (const edge of plan.edges) {
    if (!nodeIds.has(edge.from)) {
      return { error: `plan: edge references unknown source node id "${edge.from}"` };
    }
    if (!nodeIds.has(edge.to)) {
      return { error: `plan: edge references unknown target node id "${edge.to}"` };
    }
  }

  return { plan };
}

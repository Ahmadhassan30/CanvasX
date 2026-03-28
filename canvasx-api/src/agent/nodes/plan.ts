import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentState, PlannedStructure } from "../state.ts";
import { PLAN_PROMPT } from "../prompts.ts";

const llm = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0.3,
  apiKey: process.env.GROQ_API_KEY,
});

const VALID_LAYOUTS = new Set(["horizontal", "vertical", "radial", "grid", "tree"]);
const VALID_SCHEMES = new Set(["blue", "green", "purple", "orange", "mono"]);

/**
 * Node 2 — Plan
 * Converts the structured analysis into a hierarchical spatial layout plan.
 */
export async function planNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const ts = new Date().toISOString();
  console.log(
    `[${ts}] [plan] start — topic="${state.topic}" type=${state.diagramType} ` +
      `points=${state.keyPoints.length}`
  );

  const userMsg = JSON.stringify(
    {
      topic: state.topic,
      diagramType: state.diagramType,
      keyPoints: state.keyPoints,
    },
    null,
    2
  );

  let raw: string;
  try {
    const response = await llm.invoke([
      new SystemMessage(PLAN_PROMPT),
      new HumanMessage(userMsg),
    ]);
    raw = (response.content as string).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${ts}] [plan] LLM call failed: ${msg}`);
    return {
      streamChunks: [`[plan] LLM error: ${msg}`],
      plannedStructure: buildFallbackPlan(state),
    };
  }

  let plan: PlannedStructure;
  try {
    plan = JSON.parse(raw) as PlannedStructure;
  } catch {
    console.error(`[${ts}] [plan] JSON parse failed. Raw: ${raw.slice(0, 200)}`);
    return {
      streamChunks: ["[plan] Could not parse plan JSON; using fallback."],
      plannedStructure: buildFallbackPlan(state),
    };
  }

  // Normalise layout / colorScheme
  if (!VALID_LAYOUTS.has(plan.layout)) plan.layout = "vertical";
  if (!VALID_SCHEMES.has(plan.colorScheme)) plan.colorScheme = "blue";

  if (!Array.isArray(plan.nodes) || plan.nodes.length === 0) {
    return {
      streamChunks: ["[plan] Plan has zero nodes; using fallback."],
      plannedStructure: buildFallbackPlan(state),
    };
  }

  // Validate edge references
  const nodeIds = new Set(plan.nodes.map((n) => n.id));
  plan.edges = (plan.edges ?? []).filter((e) => {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) {
      console.warn(`[${ts}] [plan] Dropping edge ${e.from}→${e.to}: unknown id`);
      return false;
    }
    return true;
  });

  console.log(
    `[${ts}] [plan] done — layout=${plan.layout} nodes=${plan.nodes.length} edges=${plan.edges.length}`
  );

  return {
    plannedStructure: plan,
    streamChunks: [
      `[plan] Layout: ${plan.layout} | ${plan.nodes.length} nodes | ${plan.edges.length} edges`,
    ],
  };
}

/** Minimal fallback plan when LLM fails, derived from keyPoints. */
function buildFallbackPlan(state: AgentState): PlannedStructure {
  const root = {
    id: "root",
    label: state.topic || "Topic",
    shape: "ellipse" as const,
    level: 0,
    row: 0,
    col: 0,
    color: "#dbe4ff",
    children: state.keyPoints.map((_, i) => `node-${i}`),
  };
  const children = state.keyPoints.slice(0, 8).map((kp, i) => ({
    id: `node-${i}`,
    label: kp,
    shape: "rectangle" as const,
    level: 1,
    row: 1,
    col: i,
    color: "#a5b4fc",
    children: [],
  }));
  const edges = children.map((c) => ({
    from: "root",
    to: c.id,
    style: "solid" as const,
  }));
  return { layout: "vertical", colorScheme: "blue", nodes: [root, ...children], edges };
}

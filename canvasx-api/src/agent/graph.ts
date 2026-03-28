import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentStateAnnotation, MAX_ITERATIONS } from "./state.ts";
import { analyzeNode } from "./nodes/analyze.ts";
import { planNode } from "./nodes/plan.ts";
import { generateNode } from "./nodes/generate.ts";
import { validateNode } from "./nodes/validate.ts";
import { refineNode } from "./nodes/refine.ts";

type State = typeof AgentStateAnnotation.State;

/**
 * After validate: route to refineNode if validation failed and we still have
 * retries left; otherwise exit the graph.
 */
function routeAfterValidate(state: State): "refineNode" | typeof END {
  if (!state.isValid && state.iterationCount < MAX_ITERATIONS) {
    return "refineNode";
  }
  return END;
}

// ─── Build graph ──────────────────────────────────────────────────────────────

const builder = new StateGraph(AgentStateAnnotation);

builder
  .addNode("analyzeNode", analyzeNode)
  .addNode("planNode", planNode)
  .addNode("generateNode", generateNode)
  .addNode("validateNode", validateNode)
  .addNode("refineNode", refineNode);

// Linear pipeline entry
builder.addEdge(START, "analyzeNode");
builder.addEdge("analyzeNode", "planNode");
builder.addEdge("planNode", "generateNode");
builder.addEdge("generateNode", "validateNode");

// Validate → refine (retry) or END
builder.addConditionalEdges("validateNode", routeAfterValidate, {
  refineNode: "refineNode",
  [END]: END,
});

// After refining, re-validate
builder.addEdge("refineNode", "validateNode");

export const agentGraph = builder.compile();

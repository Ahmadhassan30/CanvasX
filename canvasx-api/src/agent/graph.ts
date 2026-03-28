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
// IMPORTANT: In @langchain/langgraph TypeScript, each addNode() call returns a
// NEW builder whose generic type includes the newly registered node name.
// All addEdge / addConditionalEdges calls must be made on this accumulated
// typed value — never on the original StateGraph instance — otherwise TS
// reports that the node name is not assignable to "__start__" | "__end__".

export const agentGraph = new StateGraph(AgentStateAnnotation)
  // ── Register nodes ────────────────────────────────────────────────────────
  .addNode("analyzeNode", analyzeNode)
  .addNode("planNode", planNode)
  .addNode("generateNode", generateNode)
  .addNode("validateNode", validateNode)
  .addNode("refineNode", refineNode)

  // ── Linear pipeline ───────────────────────────────────────────────────────
  .addEdge(START, "analyzeNode")
  .addEdge("analyzeNode", "planNode")
  .addEdge("planNode", "generateNode")
  .addEdge("generateNode", "validateNode")

  // ── Conditional retry loop ────────────────────────────────────────────────
  // validate → refine   (if !isValid && iterationCount < MAX_ITERATIONS)
  // validate → END      (if isValid  || iterationCount >= MAX_ITERATIONS)
  .addConditionalEdges("validateNode", routeAfterValidate, {
    refineNode: "refineNode",
    [END]: END,
  })

  // After refining, re-validate
  .addEdge("refineNode", "validateNode")

  // ── Compile ───────────────────────────────────────────────────────────────
  .compile();

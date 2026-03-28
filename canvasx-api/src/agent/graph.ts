import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentStateAnnotation } from "./state.ts";
import { analyzeNode } from "./nodes/analyze.ts";
import { planNode } from "./nodes/plan.ts";
import { generateNode } from "./nodes/generate.ts";
import { validateNode } from "./nodes/validate.ts";

const MAX_RETRIES = 2;

/**
 * Routing function after the validate node.
 * Returns to "generate" if validation failed and retries remain,
 * otherwise exits to END.
 */
function routeAfterValidate(
  state: typeof AgentStateAnnotation.State
): "generate" | typeof END {
  if (!state.isValid && state.retryCount <= MAX_RETRIES) {
    console.log(
      `[graph] validation failed (attempt ${state.retryCount}/${MAX_RETRIES}) — retrying generate`
    );
    return "generate";
  }
  return END;
}

/**
 * Routing function after any node that might set state.error.
 * Short-circuits to END if an error was recorded.
 */
function routeOnError(
  state: typeof AgentStateAnnotation.State,
  next: string
): string | typeof END {
  return state.error ? END : next;
}

// ─── Build Graph ─────────────────────────────────────────────────────────────

const builder = new StateGraph(AgentStateAnnotation);

builder
  .addNode("analyze", analyzeNode)
  .addNode("plan", planNode)
  .addNode("generate", generateNode)
  .addNode("validate", validateNode);

// Entry → analyze
builder.addEdge(START, "analyze");

// analyze → plan (or END on error)
builder.addConditionalEdges("analyze", (state) =>
  routeOnError(state, "plan")
);

// plan → generate (or END on error)
builder.addConditionalEdges("plan", (state) =>
  routeOnError(state, "generate")
);

// generate → validate (or END on error)
builder.addConditionalEdges("generate", (state) =>
  routeOnError(state, "validate")
);

// validate → generate (retry) or END
builder.addConditionalEdges("validate", routeAfterValidate);

export const agentGraph = builder.compile();

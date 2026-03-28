import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentState, DiagramType } from "../state.ts";
import { ANALYZE_PROMPT } from "../prompts.ts";

const llm = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0.2,
  apiKey: process.env.GROQ_API_KEY,
});

const VALID_TYPES = new Set<DiagramType>([
  "mindmap",
  "flowchart",
  "studynotes",
  "timeline",
  "comparison",
]);

interface AnalysisResult {
  topic: string;
  diagramType: DiagramType;
  keyPoints: string[];
}

/**
 * Node 1 — Analyze
 * Extracts topic, diagram type, and key points from raw user input.
 */
export async function analyzeNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [analyze] start — input length=${state.input.length}`);

  let raw: string;
  try {
    const response = await llm.invoke([
      new SystemMessage(ANALYZE_PROMPT),
      new HumanMessage(state.input),
    ]);
    raw = (response.content as string).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${ts}] [analyze] LLM call failed: ${msg}`);
    return {
      streamChunks: [`[analyze] LLM error: ${msg}`],
      // Provide a safe fallback so the graph can continue
      topic: state.input.slice(0, 60),
      diagramType: "mindmap",
      keyPoints: [state.input],
    };
  }

  let result: AnalysisResult;
  try {
    result = JSON.parse(raw) as AnalysisResult;
  } catch {
    console.error(`[${ts}] [analyze] JSON parse failed. Raw: ${raw.slice(0, 200)}`);
    return {
      streamChunks: ["[analyze] Could not parse JSON; defaulting to mindmap."],
      topic: state.input.slice(0, 60),
      diagramType: "mindmap",
      keyPoints: [state.input],
    };
  }

  const diagramType = VALID_TYPES.has(result.diagramType)
    ? result.diagramType
    : "mindmap";

  const topic = typeof result.topic === "string" && result.topic.trim()
    ? result.topic.trim()
    : state.input.slice(0, 60);

  const keyPoints = Array.isArray(result.keyPoints)
    ? result.keyPoints.filter((k) => typeof k === "string").slice(0, 12)
    : [];

  console.log(
    `[${ts}] [analyze] done — topic="${topic}" type=${diagramType} points=${keyPoints.length}`
  );

  return {
    topic,
    diagramType,
    keyPoints,
    streamChunks: [`[analyze] Detected: ${diagramType} — "${topic}"`],
  };
}

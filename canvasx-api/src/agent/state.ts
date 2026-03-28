import { Annotation } from "@langchain/langgraph";
import type { ExcalidrawElement } from "../types/excalidraw.ts";

// ─── Diagram type enum ────────────────────────────────────────────────────────
export type DiagramType =
  | "mindmap"
  | "flowchart"
  | "studynotes"
  | "timeline"
  | "comparison"
  | null;

// ─── Planned structure shape ──────────────────────────────────────────────────
export interface PlannedNode {
  id: string;
  label: string;
  shape: "rectangle" | "ellipse" | "diamond";
  level: number;    // 0 = root, 1 = primary, 2 = secondary …
  row: number;
  col: number;
  color: string;
  children: string[]; // child node ids
}

export interface PlannedEdge {
  from: string;
  to: string;
  label?: string;
  style?: "solid" | "dashed";
}

export interface PlannedStructure {
  layout: "horizontal" | "vertical" | "radial" | "grid" | "tree";
  colorScheme: "blue" | "green" | "purple" | "orange" | "mono";
  nodes: PlannedNode[];
  edges: PlannedEdge[];
}

// ─── State definition ─────────────────────────────────────────────────────────
export const AgentStateAnnotation = Annotation.Root({
  /** Raw natural-language input from the user. Set once, never mutated. */
  input: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),

  /** Detected diagram type; null until the analyze node runs. */
  diagramType: Annotation<DiagramType>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  /** Canonical topic extracted from the user input. */
  topic: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),

  /** Key concepts / bullet points extracted from the user input. */
  keyPoints: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  /** Hierarchical layout plan produced by the plan node. */
  plannedStructure: Annotation<PlannedStructure | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  /**
   * Raw Excalidraw elements produced by the generate node.
   * Replaced wholesale on every generate / refine pass.
   */
  generatedElements: Annotation<ExcalidrawElement[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  /**
   * Validation error strings from the validate node.
   * Accumulated across retries so the full history is preserved.
   */
  validationErrors: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  /**
   * Number of generate→validate→refine cycles consumed.
   * Each refine pass increments by 1. Max is 3.
   */
  iterationCount: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),

  /** Whether the last validate pass approved the elements. */
  isValid: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),

  /**
   * Final, validated Excalidraw elements ready for the client.
   * Written only when isValid is true.
   */
  finalElements: Annotation<ExcalidrawElement[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  /**
   * Ordered log of progress messages streamed back to the client.
   * Appended by each node.
   */
  streamChunks: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;

/** Hard cap on generate→validate→refine iterations. */
export const MAX_ITERATIONS = 3;

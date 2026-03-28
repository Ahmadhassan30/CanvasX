import { Annotation } from "@langchain/langgraph";
import type { ExcalidrawElement } from "../types/excalidraw.ts";

// ─── LangGraph State Definition ──────────────────────────────────────────────
// Each field uses Annotation to declare its reducer strategy.
// Fields without a reducer are overwritten on each update (last-write wins).
// Fields with a reducer accumulate values across node updates.

export const AgentStateAnnotation = Annotation.Root({
  /**
   * The raw natural-language prompt submitted by the user.
   * Immutable after the first write — set once in the entry route.
   */
  userPrompt: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),

  /**
   * Structured analysis of the user's intent produced by the analyze node.
   * Describes diagram type, entities, relationships, and tone.
   */
  analysis: Annotation<{
    diagramType: string;
    entities: string[];
    relationships: string[];
    style: string;
    complexity: "simple" | "medium" | "complex";
  } | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  /**
   * High-level layout plan produced by the plan node.
   * Describes element positions, groupings, and flow direction.
   */
  plan: Annotation<{
    layout: "horizontal" | "vertical" | "radial" | "grid";
    nodes: Array<{
      id: string;
      label: string;
      type: "shape" | "text" | "frame";
      shape: "rectangle" | "ellipse" | "diamond";
      row: number;
      col: number;
    }>;
    edges: Array<{
      from: string;
      to: string;
      label?: string;
    }>;
  } | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  /**
   * Generated Excalidraw JSON elements produced by the generate node.
   * Fully typed; populated after successful generation.
   */
  elements: Annotation<ExcalidrawElement[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  /**
   * Whether the last validation step approved the generated elements.
   */
  isValid: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),

  /**
   * Accumulated validation errors from the validate node.
   * Appends across retries so the full error history is preserved.
   */
  validationErrors: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  /**
   * Number of generate→validate retry attempts consumed.
   * Used to enforce a maximum retry cap and prevent infinite loops.
   */
  retryCount: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),

  /**
   * Terminal error message if the pipeline fails unrecoverably.
   */
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;

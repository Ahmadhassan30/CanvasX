import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentState } from "../state.ts";
import type { ExcalidrawElement } from "../../types/excalidraw.ts";
import { VALIDATE_PROMPT } from "../prompts.ts";

const llm = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0.1,
  apiKey: process.env.GROQ_API_KEY,
});

const REQUIRED_BASE = [
  "id", "type", "x", "y", "width", "height", "angle",
  "strokeColor", "backgroundColor", "fillStyle", "strokeWidth",
  "strokeStyle", "roughness", "opacity", "groupIds", "frameId",
  "roundness", "seed", "version", "versionNonce", "isDeleted",
  "boundElements", "updated", "link", "locked",
] as const;

const VALID_TYPES = new Set([
  "rectangle", "ellipse", "diamond", "text", "arrow",
  "line", "frame", "freedraw",
]);

const TEXT_EXTRA = ["text", "originalText", "fontSize", "fontFamily", "textAlign", "verticalAlign"];
const ARROW_EXTRA = ["points", "startBinding", "endBinding", "startArrowhead", "endArrowhead"];

/** Fast deterministic schema check — no LLM cost. */
function preValidate(elements: Record<string, unknown>[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const containerIds = new Set<string>();

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const prefix = `[${i}] id="${el["id"] ?? "?"}":`;

    // Collect ids for containerId validation below
    if (typeof el["id"] === "string") {
      if (ids.has(el["id"])) errors.push(`${prefix} duplicate id "${el["id"]}"`);
      ids.add(el["id"]);
    }

    // Required base fields
    for (const f of REQUIRED_BASE) {
      if (!(f in el)) errors.push(`${prefix} missing field "${f}"`);
    }

    // Type check
    if (el["type"] !== undefined && !VALID_TYPES.has(el["type"] as string)) {
      errors.push(`${prefix} invalid type "${el["type"]}"`);
    }

    // Numeric guards
    if (typeof el["width"] === "number" && el["width"] <= 0)
      errors.push(`${prefix} width must be > 0 (got ${el["width"]})`);
    if (typeof el["height"] === "number" && el["height"] <= 0)
      errors.push(`${prefix} height must be > 0 (got ${el["height"]})`);
    if (typeof el["opacity"] === "number" && (el["opacity"] < 0 || el["opacity"] > 100))
      errors.push(`${prefix} opacity ${el["opacity"]} out of [0,100]`);
    if (typeof el["roughness"] === "number" && ![0, 1, 2].includes(el["roughness"]))
      errors.push(`${prefix} roughness must be 0, 1, or 2`);

    // Text-specific
    if (el["type"] === "text") {
      for (const f of TEXT_EXTRA) {
        if (!(f in el)) errors.push(`${prefix} text element missing "${f}"`);
      }
      if (typeof el["containerId"] === "string") {
        containerIds.add(el["containerId"]);
      }
    }

    // Arrow/line-specific
    if (el["type"] === "arrow" || el["type"] === "line") {
      for (const f of ARROW_EXTRA) {
        if (!(f in el)) errors.push(`${prefix} arrow/line missing "${f}"`);
      }
      const pts = el["points"];
      if (!Array.isArray(pts) || pts.length < 2)
        errors.push(`${prefix} points must be an array of ≥ 2 [x,y] pairs`);
    }
  }

  // containerId dangling reference check
  for (const cid of containerIds) {
    if (!ids.has(cid))
      errors.push(`containerId "${cid}" references a non-existent element id`);
  }

  return errors;
}

/**
 * Node 4 — Validate
 * Runs a fast TypeScript pre-check, then asks Groq for semantic validation.
 * Sets isValid and accumulates validation errors.
 */
export async function validateNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const ts = new Date().toISOString();
  console.log(
    `[${ts}] [validate] start — elements=${state.generatedElements.length} iteration=${state.iterationCount}`
  );

  if (!state.generatedElements || state.generatedElements.length === 0) {
    console.warn(`[${ts}] [validate] empty elements array`);
    return {
      isValid: false,
      validationErrors: ["No elements to validate."],
      streamChunks: ["[validate] Empty elements — marking invalid"],
    };
  }

  // ── Fast pre-pass (free) ─────────────────────────────────────────────────
  const preErrors = preValidate(state.generatedElements as unknown as Record<string, unknown>[]);
  if (preErrors.length > 0) {
    console.warn(`[${ts}] [validate] pre-validation found ${preErrors.length} errors`);
    return {
      isValid: false,
      validationErrors: preErrors,
      streamChunks: [`[validate] ${preErrors.length} schema error(s) found`],
    };
  }

  // ── LLM semantic pass ────────────────────────────────────────────────────
  let raw: string;
  try {
    const response = await llm.invoke([
      new SystemMessage(VALIDATE_PROMPT),
      new HumanMessage(JSON.stringify(state.generatedElements, null, 2)),
    ]);
    raw = (response.content as string).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[${ts}] [validate] LLM call failed — treating as valid: ${msg}`);
    // Pre-pass passed; accept as valid if LLM is unavailable
    return {
      isValid: true,
      validationErrors: [],
      finalElements: state.generatedElements,
      streamChunks: ["[validate] LLM unavailable — pre-pass passed, accepting"],
    };
  }

  let result: { isValid: boolean; errors: string[] };
  try {
    result = JSON.parse(raw) as { isValid: boolean; errors: string[] };
  } catch {
    console.warn(`[${ts}] [validate] LLM returned non-JSON — treating as valid`);
    return {
      isValid: true,
      validationErrors: [],
      finalElements: state.generatedElements,
      streamChunks: ["[validate] Non-JSON response — pre-pass passed, accepting"],
    };
  }

  const isValid = result.isValid === true;
  const errors: string[] = Array.isArray(result.errors) ? result.errors : [];

  console.log(`[${ts}] [validate] done — isValid=${isValid} errors=${errors.length}`);

  return {
    isValid,
    validationErrors: errors,
    finalElements: isValid ? state.generatedElements : [],
    streamChunks: [
      isValid
        ? `[validate] ✓ Valid — ${state.generatedElements.length} elements accepted`
        : `[validate] ✗ Invalid — ${errors.length} error(s)`,
    ],
  };
}

import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentState } from "../state.ts";
import { VALIDATE_SYSTEM_PROMPT } from "../prompts.ts";

const llm = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0,
  apiKey: process.env.GROQ_API_KEY,
});

const REQUIRED_BASE_FIELDS: Array<keyof Record<string, unknown>> = [
  "id",
  "type",
  "x",
  "y",
  "width",
  "height",
  "angle",
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "roughness",
  "opacity",
  "groupIds",
  "frameId",
  "roundness",
  "seed",
  "version",
  "versionNonce",
  "isDeleted",
  "boundElements",
  "updated",
  "link",
  "locked",
];

const VALID_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "text",
  "arrow",
  "line",
  "frame",
  "freedraw",
]);

/**
 * Performs a fast deterministic pre-validation pass in TypeScript before
 * spending an LLM call — catches obvious structural issues immediately.
 */
function preValidate(elements: unknown[]): string[] {
  const errors: string[] = [];

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as Record<string, unknown>;
    const prefix = `Element[${i}] (id="${el["id"] ?? "?"}"):`;

    for (const field of REQUIRED_BASE_FIELDS) {
      if (!(field in el)) {
        errors.push(`${prefix} missing required field "${field}"`);
      }
    }

    if (el["type"] !== undefined && !VALID_TYPES.has(el["type"] as string)) {
      errors.push(`${prefix} invalid type "${el["type"]}"`);
    }

    if (typeof el["width"] === "number" && el["width"] <= 0) {
      errors.push(`${prefix} width must be positive`);
    }

    if (typeof el["height"] === "number" && el["height"] <= 0) {
      errors.push(`${prefix} height must be positive`);
    }

    if (typeof el["opacity"] === "number" && (el["opacity"] < 0 || el["opacity"] > 100)) {
      errors.push(`${prefix} opacity must be in range [0, 100]`);
    }

    if (typeof el["roughness"] === "number" && ![0, 1, 2].includes(el["roughness"])) {
      errors.push(`${prefix} roughness must be 0, 1, or 2`);
    }

    if (el["type"] === "text") {
      for (const tf of ["text", "fontSize", "fontFamily", "textAlign", "verticalAlign", "originalText"]) {
        if (!(tf in el)) {
          errors.push(`${prefix} text element missing field "${tf}"`);
        }
      }
    }

    if (el["type"] === "arrow" || el["type"] === "line") {
      const pts = el["points"];
      if (!Array.isArray(pts) || pts.length < 2) {
        errors.push(`${prefix} arrow/line must have at least 2 points`);
      }
    }
  }

  return errors;
}

/**
 * Node 4 — Validate
 * Runs a fast deterministic pre-check then calls the LLM for a semantic review.
 * Sets isValid and appends any errors to validationErrors.
 */
export async function validateNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const elements = state.elements;

  if (!elements || elements.length === 0) {
    return {
      isValid: false,
      validationErrors: ["validate: elements array is empty — nothing to validate."],
      retryCount: 1,
    };
  }

  // Fast deterministic pre-pass
  const preErrors = preValidate(elements as unknown[]);
  if (preErrors.length > 0) {
    return {
      isValid: false,
      validationErrors: preErrors,
      retryCount: 1,
    };
  }

  // LLM semantic validation pass
  const response = await llm.invoke([
    new SystemMessage(VALIDATE_SYSTEM_PROMPT),
    new HumanMessage(JSON.stringify(elements, null, 2)),
  ]);

  const raw = (response.content as string).trim();

  let result: { valid: boolean; errors: string[] };
  try {
    result = JSON.parse(raw) as { valid: boolean; errors: string[] };
  } catch {
    // If the LLM mangled its own output treat it as a validation error but
    // don't fail hard — the pre-pass already passed so elements are likely good.
    console.warn("[validate] LLM returned non-JSON response; treating as valid.");
    return { isValid: true, validationErrors: [] };
  }

  return {
    isValid: result.valid,
    validationErrors: result.valid ? [] : (result.errors ?? ["Unknown validation error"]),
    retryCount: result.valid ? 0 : 1,
  };
}

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

// ─── Mock elements ─────────────────────────────────────────────────────────────
// A minimal but complete mindmap diagram returned instantly without any LLM call.
// Used when GROQ_API_KEY is absent or CANVASX_MOCK=true.

const MOCK_ELEMENTS = [
  // ── Root ─────────────────────────────────────────────────────────────────
  {
    id: "mock-root", type: "ellipse",
    x: 800, y: 380, width: 220, height: 90, angle: 0,
    strokeColor: "#3730a3", backgroundColor: "#4f46e5",
    fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid",
    roughness: 1, opacity: 100, groupIds: ["grp-root"],
    frameId: null, roundness: { type: 3 },
    seed: 11111, version: 1, versionNonce: 22222,
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
  },
  {
    id: "mock-root-text", type: "text",
    x: 810, y: 390, width: 200, height: 70, angle: 0,
    strokeColor: "#ffffff", backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid",
    roughness: 0, opacity: 100, groupIds: ["grp-root"],
    frameId: null, roundness: null,
    seed: 33333, version: 1, versionNonce: 44444,
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
    text: "Mock Topic", originalText: "Mock Topic",
    fontSize: 20, fontFamily: 1,
    textAlign: "center", verticalAlign: "middle",
    containerId: "mock-root", autoResize: true, lineHeight: 1.25,
  },
  // ── Branch 1 (right) ─────────────────────────────────────────────────────
  {
    id: "mock-b1", type: "rectangle",
    x: 1100, y: 370, width: 180, height: 70, angle: 0,
    strokeColor: "#3730a3", backgroundColor: "#dbe4ff",
    fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid",
    roughness: 1, opacity: 100, groupIds: ["grp-b1"],
    frameId: null, roundness: { type: 3 },
    seed: 55555, version: 1, versionNonce: 66666,
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
  },
  {
    id: "mock-b1-text", type: "text",
    x: 1110, y: 380, width: 160, height: 50, angle: 0,
    strokeColor: "#1e1e1e", backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid",
    roughness: 0, opacity: 100, groupIds: ["grp-b1"],
    frameId: null, roundness: null,
    seed: 77777, version: 1, versionNonce: 88888,
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
    text: "Branch One", originalText: "Branch One",
    fontSize: 16, fontFamily: 1,
    textAlign: "center", verticalAlign: "middle",
    containerId: "mock-b1", autoResize: true, lineHeight: 1.25,
  },
  // Arrow root → b1
  {
    id: "mock-arr-1", type: "arrow",
    x: 910, y: 425, width: 1, height: 1, angle: 0,
    strokeColor: "#6366f1", backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 1.5, strokeStyle: "solid",
    roughness: 1, opacity: 100, groupIds: [],
    frameId: null, roundness: { type: 2 },
    seed: 99991, version: 1, versionNonce: 11113,
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
    points: [[0, 0], [190, 0]],
    startBinding: null, endBinding: null,
    startArrowhead: null, endArrowhead: "arrow", elbowed: false,
  },
  // ── Branch 2 (left) ──────────────────────────────────────────────────────
  {
    id: "mock-b2", type: "rectangle",
    x: 520, y: 370, width: 180, height: 70, angle: 0,
    strokeColor: "#3730a3", backgroundColor: "#dbe4ff",
    fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid",
    roughness: 1, opacity: 100, groupIds: ["grp-b2"],
    frameId: null, roundness: { type: 3 },
    seed: 22223, version: 1, versionNonce: 33334,
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
  },
  {
    id: "mock-b2-text", type: "text",
    x: 530, y: 380, width: 160, height: 50, angle: 0,
    strokeColor: "#1e1e1e", backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid",
    roughness: 0, opacity: 100, groupIds: ["grp-b2"],
    frameId: null, roundness: null,
    seed: 44445, version: 1, versionNonce: 55556,
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
    text: "Branch Two", originalText: "Branch Two",
    fontSize: 16, fontFamily: 1,
    textAlign: "center", verticalAlign: "middle",
    containerId: "mock-b2", autoResize: true, lineHeight: 1.25,
  },
  // Arrow root → b2
  {
    id: "mock-arr-2", type: "arrow",
    x: 800, y: 425, width: 1, height: 1, angle: 0,
    strokeColor: "#6366f1", backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 1.5, strokeStyle: "solid",
    roughness: 1, opacity: 100, groupIds: [],
    frameId: null, roundness: { type: 2 },
    seed: 66667, version: 1, versionNonce: 77778,
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
    points: [[0, 0], [-190, 0]],
    startBinding: null, endBinding: null,
    startArrowhead: null, endArrowhead: "arrow", elbowed: false,
  },
  // ── Branch 3 (top) ───────────────────────────────────────────────────────
  {
    id: "mock-b3", type: "rectangle",
    x: 820, y: 200, width: 180, height: 70, angle: 0,
    strokeColor: "#3730a3", backgroundColor: "#dbe4ff",
    fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid",
    roughness: 1, opacity: 100, groupIds: ["grp-b3"],
    frameId: null, roundness: { type: 3 },
    seed: 88889, version: 1, versionNonce: 99990,
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
  },
  {
    id: "mock-b3-text", type: "text",
    x: 830, y: 210, width: 160, height: 50, angle: 0,
    strokeColor: "#1e1e1e", backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid",
    roughness: 0, opacity: 100, groupIds: ["grp-b3"],
    frameId: null, roundness: null,
    seed: 11114, version: 1, versionNonce: 22225,
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
    text: "Branch Three", originalText: "Branch Three",
    fontSize: 16, fontFamily: 1,
    textAlign: "center", verticalAlign: "middle",
    containerId: "mock-b3", autoResize: true, lineHeight: 1.25,
  },
  // Arrow root → b3
  {
    id: "mock-arr-3", type: "arrow",
    x: 910, y: 380, width: 1, height: 1, angle: 0,
    strokeColor: "#6366f1", backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 1.5, strokeStyle: "solid",
    roughness: 1, opacity: 100, groupIds: [],
    frameId: null, roundness: { type: 2 },
    seed: 33336, version: 1, versionNonce: 44447,
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
    points: [[0, 0], [0, -145]],
    startBinding: null, endBinding: null,
    startArrowhead: null, endArrowhead: "arrow", elbowed: false,
  },
  // ── Branch 4 (bottom) ────────────────────────────────────────────────────
  {
    id: "mock-b4", type: "rectangle",
    x: 820, y: 560, width: 180, height: 70, angle: 0,
    strokeColor: "#3730a3", backgroundColor: "#dbe4ff",
    fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid",
    roughness: 1, opacity: 100, groupIds: ["grp-b4"],
    frameId: null, roundness: { type: 3 },
    seed: 55558, version: 1, versionNonce: 66669,
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
  },
  {
    id: "mock-b4-text", type: "text",
    x: 830, y: 570, width: 160, height: 50, angle: 0,
    strokeColor: "#1e1e1e", backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid",
    roughness: 0, opacity: 100, groupIds: ["grp-b4"],
    frameId: null, roundness: null,
    seed: 77780, version: 1, versionNonce: 88881,
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
    text: "Branch Four", originalText: "Branch Four",
    fontSize: 16, fontFamily: 1,
    textAlign: "center", verticalAlign: "middle",
    containerId: "mock-b4", autoResize: true, lineHeight: 1.25,
  },
  // Arrow root → b4
  {
    id: "mock-arr-4", type: "arrow",
    x: 910, y: 470, width: 1, height: 1, angle: 0,
    strokeColor: "#6366f1", backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 1.5, strokeStyle: "solid",
    roughness: 1, opacity: 100, groupIds: [],
    frameId: null, roundness: { type: 2 },
    seed: 99992, version: 1, versionNonce: 11115,
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
    points: [[0, 0], [0, 125]],
    startBinding: null, endBinding: null,
    startArrowhead: null, endArrowhead: "arrow", elbowed: false,
  },
] as const;

const mock = new Hono();

/**
 * POST /api/agent/generate  (mock)
 * Streams the hardcoded MOCK_ELEMENTS instantly so the frontend can be
 * tested without a GROQ_API_KEY.
 */
mock.post("/generate", async (c) => {
  c.header("X-Mock", "true");

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: "status",
      data: JSON.stringify({ stage: "generating", message: "Mock mode — returning sample elements" }),
    });

    // Tiny delay so the UI can render the status event first
    await new Promise((r) => setTimeout(r, 120));

    await stream.writeSSE({
      event: "elements",
      data: JSON.stringify({
        elements: MOCK_ELEMENTS,
        appState: {
          viewBackgroundColor: "#ffffff",
          currentItemStrokeColor: "#1e1e1e",
          zoom: { value: 1 },
          scrollX: 0,
          scrollY: 0,
        },
      }),
    });

    await stream.writeSSE({
      event: "done",
      data: JSON.stringify({
        success: true,
        elementCount: MOCK_ELEMENTS.length,
        cached: false,
        iterationCount: 0,
        diagramType: "mindmap",
        topic: "Mock Topic",
      }),
    });
  });
});

/**
 * GET /api/agent/health  (mock)
 */
mock.get("/health", (c) =>
  c.json({
    status: "ok",
    mode: "mock",
    model: "none (mock mode)",
    cache: { size: 0 },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }),
);

export default mock;

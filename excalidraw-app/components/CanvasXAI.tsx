import React, { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type DiagramMode =
  | "mindmap"
  | "flowchart"
  | "studynotes"
  | "timeline"
  | "comparison";

type GenerationStage =
  | "analyzing"
  | "planning"
  | "generating"
  | "validating"
  | "refining"
  | "idle";

interface ExcalidrawElement {
  [key: string]: unknown;
}

interface CanvasXAIProps {
  /** Insert new elements into the canvas (deduplication handled here) */
  insertElements: (elements: ExcalidrawElement[]) => void;
  /** Returns the set of element IDs currently on the canvas */
  getExistingIds: () => Set<string>;
  onClose: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:3001";
const MAX_CHARS = 4000;

const MODES: { id: DiagramMode; label: string }[] = [
  { id: "mindmap", label: "Mindmap" },
  { id: "flowchart", label: "Flowchart" },
  { id: "studynotes", label: "Study Notes" },
  { id: "timeline", label: "Timeline" },
  { id: "comparison", label: "Comparison" },
];

const STAGE_LABELS: Record<GenerationStage, string> = {
  analyzing: "Analyzing…",
  planning: "Planning…",
  generating: "Generating…",
  validating: "Validating…",
  refining: "Refining…",
  idle: "Generate",
};

// ─── Spinner ──────────────────────────────────────────────────────────────────

const Spinner = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    style={{ animation: "canvasx-spin 0.8s linear infinite", flexShrink: 0 }}
    aria-hidden="true"
  >
    <circle
      cx="7"
      cy="7"
      r="5.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeDasharray="22 12"
    />
  </svg>
);

// ─── Wand icon ────────────────────────────────────────────────────────────────

const WandIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5" />
  </svg>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const CanvasXAI: React.FC<CanvasXAIProps> = ({
  insertElements,
  getExistingIds,
  onClose,
}) => {
  const [mode, setMode] = useState<DiagramMode>("mindmap");
  const [input, setInput] = useState("");
  const [stage, setStage] = useState<GenerationStage>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [addedCount, setAddedCount] = useState<number | null>(null);

  const isGenerating = stage !== "idle";
  const remaining = MAX_CHARS - input.length;

  const reset = useCallback(() => {
    setStage("idle");
    setStatusMessage("");
    setErrorMessage("");
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!input.trim() || isGenerating) return;

    reset();
    setAddedCount(null);
    setErrorMessage("");
    setStage("analyzing");
    setStatusMessage("Starting pipeline…");

    // Build URL with query params so EventSource can use GET,
    // OR use fetch + ReadableStream for POST. We use fetch+stream
    // since the API accepts POST.
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/api/agent/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim(), mode }),
        signal: AbortSignal.timeout(35_000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Connection failed: ${msg}`);
      setStage("idle");
      return;
    }

    if (!response.ok) {
      setErrorMessage(`Server error ${response.status}`);
      setStage("idle");
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      setErrorMessage("No response body from server.");
      setStage("idle");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    const parseSSEChunk = (raw: string) => {
      const lines = raw.split("\n");
      let event = "message";
      let data = "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          data = line.slice(5).trim();
        }
      }

      if (!data) return;

      try {
        const payload = JSON.parse(data);

        if (event === "status") {
          const s = payload.stage as GenerationStage;
          setStage(s);
          setStatusMessage(payload.message ?? "");
        } else if (event === "elements") {
          const newElements: ExcalidrawElement[] = payload.elements ?? [];
          if (newElements.length > 0) {
            // ── Gather existing element ids ────────────────────────────
            const existingIds = getExistingIds();

            // ── Deduplicate: drop AI elements whose id already exists ───
            const deduped = newElements.filter(
              (el) => !existingIds.has((el as { id?: string }).id ?? ""),
            );

            if (deduped.length > 0) {
              insertElements(deduped);
              setAddedCount(deduped.length);
            }
          }
        } else if (event === "done") {
          setStage("idle");
          setStatusMessage("");
          if (!payload.success) {
            setErrorMessage("Generation completed but no elements were added.");
          }
        } else if (event === "error") {
          setErrorMessage(payload.message ?? "Unknown error");
          setStage("idle");
        }
      } catch {
        // malformed SSE data — skip
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newline
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const ev of events) {
          if (ev.trim()) parseSSEChunk(ev);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Stream error: ${msg}`);
    } finally {
      setStage("idle");
      reader.releaseLock();
    }
  }, [input, mode, isGenerating, insertElements, getExistingIds, reset]);

  const handleRetry = useCallback(() => {
    setErrorMessage("");
    handleGenerate();
  }, [handleGenerate]);

  const handleClear = useCallback(() => {
    setInput("");
    setErrorMessage("");
    setAddedCount(null);
    setStatusMessage("");
  }, []);

  return (
    <>
      {/* Keyframe injected once via a style tag */}
      <style>{`
        @keyframes canvasx-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes canvasx-slide-in {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div
        className="Island"
        style={{
          width: 280,
          display: "flex",
          flexDirection: "column",
          gap: 0,
          padding: 0,
          overflow: "hidden",
          animation: "canvasx-slide-in 0.18s ease",
          boxShadow: "var(--shadow-island)",
          borderRadius: "var(--border-radius-lg, 8px)",
          background: "var(--island-bg-color, var(--color-surface-low))",
          border: "1px solid var(--color-border)",
        }}
        role="dialog"
        aria-label="CanvasX AI panel"
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px 8px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <WandIcon />
            <span
              style={{
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: "0.01em",
                color: "var(--color-on-surface)",
              }}
            >
              CanvasX AI
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI panel"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-on-surface-low)",
              padding: "2px 4px",
              borderRadius: 4,
              lineHeight: 1,
              fontSize: 16,
            }}
          >
            ×
          </button>
        </div>

        {/* ── Mode selector ───────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            padding: "8px 12px",
            borderBottom: "1px solid var(--color-border)",
          }}
          role="group"
          aria-label="Diagram mode"
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              style={{
                fontSize: 11,
                fontWeight: mode === m.id ? 700 : 400,
                padding: "3px 8px",
                borderRadius: 999,
                border: `1.5px solid ${
                  mode === m.id
                    ? "var(--color-primary)"
                    : "var(--color-border)"
                }`,
                background:
                  mode === m.id
                    ? "var(--color-primary)"
                    : "transparent",
                color:
                  mode === m.id
                    ? "var(--color-primary-contrast)"
                    : "var(--color-on-surface)",
                cursor: "pointer",
                transition: "all 0.12s ease",
                whiteSpace: "nowrap",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* ── Input area ──────────────────────────────────────────────── */}
        <div style={{ padding: "8px 12px", position: "relative" }}>
          <textarea
            id="canvasx-ai-input"
            value={input}
            onChange={(e) =>
              setInput(e.target.value.slice(0, MAX_CHARS))
            }
            placeholder="Paste your content or describe a topic…"
            rows={5}
            disabled={isGenerating}
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "vertical",
              minHeight: 90,
              fontSize: 12,
              lineHeight: 1.5,
              padding: "7px 9px",
              borderRadius: "var(--border-radius-md, 6px)",
              border: "1.5px solid var(--color-border)",
              background: "var(--color-surface-low, var(--island-bg-color))",
              color: "var(--color-on-surface)",
              fontFamily: "inherit",
              outline: "none",
              opacity: isGenerating ? 0.6 : 1,
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--color-primary)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--color-border)";
            }}
          />
          {/* char counter + clear */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 4,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color:
                  remaining < 200
                    ? "var(--color-danger)"
                    : "var(--color-on-surface-low)",
              }}
            >
              {remaining} / {MAX_CHARS}
            </span>
            {input && !isGenerating && (
              <button
                type="button"
                onClick={handleClear}
                style={{
                  fontSize: 10,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-on-surface-low)",
                  padding: "0 2px",
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Generate button ─────────────────────────────────────────── */}
        <div style={{ padding: "0 12px 8px" }}>
          <button
            type="button"
            id="canvasx-ai-generate"
            onClick={handleGenerate}
            disabled={!input.trim() || isGenerating}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: "var(--border-radius-md, 6px)",
              border: "none",
              cursor:
                !input.trim() || isGenerating ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
              background:
                !input.trim() || isGenerating
                  ? "var(--color-surface-mid, var(--color-border))"
                  : "var(--color-primary)",
              color:
                !input.trim() || isGenerating
                  ? "var(--color-on-surface-low)"
                  : "var(--color-primary-contrast)",
              transition: "background 0.12s ease",
            }}
            aria-busy={isGenerating}
          >
            {isGenerating && <Spinner />}
            {isGenerating ? STAGE_LABELS[stage] : "Generate"}
          </button>
        </div>

        {/* ── Status bar ──────────────────────────────────────────────── */}
        {statusMessage && (
          <div
            role="status"
            aria-live="polite"
            style={{
              margin: "0 12px 8px",
              padding: "5px 8px",
              borderRadius: "var(--border-radius-md, 6px)",
              background: "var(--color-surface-mid, rgba(0,0,0,0.06))",
              fontSize: 11,
              color: "var(--color-on-surface-low)",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {isGenerating && <Spinner />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {statusMessage}
            </span>
          </div>
        )}

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {errorMessage && (
          <div
            role="alert"
            style={{
              margin: "0 12px 8px",
              padding: "7px 10px",
              borderRadius: "var(--border-radius-md, 6px)",
              background: "var(--color-danger-light, #fef2f2)",
              border: "1px solid var(--color-danger, #ef4444)",
              fontSize: 11,
              color: "var(--color-danger, #dc2626)",
            }}
          >
            <div style={{ marginBottom: 5 }}>{errorMessage}</div>
            <button
              type="button"
              onClick={handleRetry}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid var(--color-danger, #ef4444)",
                background: "transparent",
                color: "var(--color-danger, #dc2626)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Success result ───────────────────────────────────────────── */}
        {addedCount !== null && !errorMessage && !isGenerating && (
          <div
            role="status"
            style={{
              margin: "0 12px 10px",
              padding: "6px 10px",
              borderRadius: "var(--border-radius-md, 6px)",
              background: "var(--color-success-light, #f0fdf4)",
              border: "1px solid var(--color-success, #22c55e)",
              fontSize: 11,
              color: "var(--color-success-dark, #15803d)",
              fontWeight: 500,
            }}
          >
            ✓ {addedCount} element{addedCount !== 1 ? "s" : ""} added to canvas
          </div>
        )}
      </div>
    </>
  );
};

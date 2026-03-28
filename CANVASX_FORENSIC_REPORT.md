# CANVASX Forensic Report

## 1) Scope, Method, and Confidence

This report is a forensic architecture analysis of the Excalidraw monorepo at `c:\Users\ahmad\Desktop\excalidraw`.

Method:
- Static source inspection across core runtime, renderer, actions, state model, history/delta engine, persistence, collaboration, AI extension points, and deployment/build layers.
- Cross-checked behavioral claims against concrete implementation files.
- Added quantitative repository inventory from `git ls-files`.

Confidence:
- High for architecture and control-flow claims tied to inspected files.
- Medium for non-inspected edge paths in long-tail files not central to runtime execution.

Non-goals:
- No source code modifications.
- No runtime benchmark claims.
- No production hardening recommendations beyond direct observations.

---

## 2) Monorepo Topology and Package Boundaries

Primary workspace shape:
- Root workspace orchestrates Yarn v1 workspaces and top-level scripts.
- Runtime app lives in `excalidraw-app/`.
- Core editor package lives in `packages/excalidraw/`.
- Supporting internal packages: `packages/common/`, `packages/element/`, `packages/math/`, `packages/utils/`.

Evidence:
- Workspace and scripts: `package.json`.
- Internal package manifests: `packages/*/package.json`.
- TypeScript path aliases: `tsconfig.json`, `packages/tsconfig.base.json`.
- Vite/Vitest alias parity: `excalidraw-app/vite.config.mts`, `vitest.config.mts`.

Key boundary observations:
- `@excalidraw/excalidraw` is the primary package API surface.
- `@excalidraw/element` carries element schema, geometry, scene/store/delta primitives.
- `@excalidraw/common` centralizes constants, feature flags, utilities, and shared infra abstractions.
- `@excalidraw/math` contains geometry/vector math helpers.
- `@excalidraw/utils` exposes export/util helpers and reuses internal package APIs.

This is a layered package design where `excalidraw-app` composes and extends the core editor package rather than re-implementing engine concerns.

---

## 3) Application Boot, Runtime Ownership, and Lifecycle

App boot pipeline (`excalidraw-app`):
- Entry point mounts React StrictMode and registers PWA SW hooks:
  - `excalidraw-app/index.tsx`.
- Application shell and local-first/collab integration are composed in:
  - `excalidraw-app/App.tsx`.

Core editor boot (`packages/excalidraw`):
- External host uses `Excalidraw` component from:
  - `packages/excalidraw/index.tsx`.
- `ExcalidrawBase` normalizes UI options and mounts `App` with providers.
- `InitializeApp` gates render until i18n language initialization completes:
  - `packages/excalidraw/components/InitializeApp.tsx`.

Runtime ownership (`App` class):
- Central runtime class:
  - `packages/excalidraw/components/App.tsx`.
- Constructor wires:
  - `Scene`, `Renderer`, `Store`, `History`, `ActionManager`, `Library`, `Fonts`.
- `createExcalidrawAPI()` builds imperative API bridge (`updateScene`, `applyDeltas`, action registration, subscriptions, etc.).

Lifecycle control points:
- `componentDidMount`:
  - Creates API instance, subscribes durable increments to `history.record`, subscribes optional `onIncrement`, installs listeners, initializes scene, emits mount/initialize events.
- `componentDidUpdate`:
  - Commits into store (`store.commit(elementsMap, this.state)`), emits `onChange`, synchronizes downstream state.
- `componentWillUnmount`:
  - Invalidates API usage, clears listeners/emitters/cache/state holders and destroys renderer/scene-related state.

This is a stateful engine-style React host, not a purely declarative reducer app.

---

## 4) Canonical Data Model: Elements, Ordering, and Scene Semantics

Canonical element schema:
- Defined in `packages/element/src/types.ts`.
- `ExcalidrawElement` is a discriminated union (`text`, `line`, `arrow`, `image`, `frame`, `magicframe`, `iframe`, `embeddable`, etc.).

Key invariants embedded in schema:
- `version` and `versionNonce` support deterministic conflict resolution.
- `index` uses fractional indexing for stable multiplayer/undo ordering.
- `boundElements`, `frameId`, and binding structures encode relational semantics.
- Image/file link (`fileId`, `status`, `crop`, `scale`) is first-class, not external metadata.

Scene container behavior:
- `packages/element/src/Scene.ts`.
- Maintains both full and non-deleted element arrays/maps.
- Caches selected elements by selection hash and invalidates via scene updates.
- Ensures index consistency through `syncInvalidIndices`/`syncMovedIndices`.
- Emits scene update callbacks via nonce-driven invalidation.

Implication:
- Scene is not only storage. It enforces ordering integrity and acts as a mutation/event boundary.

---

## 5) Render Pipeline: Static, Interactive, New-Element, and SVG Export

Canvas render layers:
- Static scene rendering:
  - `packages/excalidraw/renderer/staticScene.ts`.
  - Draws background/grid/elements/frame clipping/link icons/pending flowchart nodes.
- Interactive overlay rendering:
  - `packages/excalidraw/renderer/interactiveScene.ts`.
  - Draws UI affordances: selection handles, guides/snaps, collaborator cursors, editor overlays.
- New-element overlay rendering:
  - `packages/excalidraw/renderer/renderNewElementScene.ts`.
  - Renders in-progress element creation separately.

React canvas composition:
- `packages/excalidraw/components/App.tsx` render tree stacks:
  - `StaticCanvas`, optional `NewElementCanvas`, then `InteractiveCanvas`.
- Canvas wrappers and memoization:
  - `packages/excalidraw/components/canvases/StaticCanvas.tsx`
  - `packages/excalidraw/components/canvases/NewElementCanvas.tsx`
  - `packages/excalidraw/components/canvases/InteractiveCanvas.tsx`

Viewport culling and renderables:
- `packages/excalidraw/scene/Renderer.ts` computes visible elements using viewport tests and memoization.

Export render path:
- Canvas/SVG export orchestration:
  - `packages/excalidraw/scene/export.ts`.
- SVG element serialization and image symbol reuse/cropping/clip handling:
  - `packages/excalidraw/renderer/staticSvgScene.ts`.
- Public export facade:
  - `packages/utils/src/export.ts`.

Notable behavior:
- Export uses modified frame-rendering semantics vs editor mode.
- SVG export can embed scene payload metadata and optionally inline fonts.
- Image export path supports metadata embedding for `.png` round-trip fidelity.

---

## 6) Action System, Shortcuts, and UI Command Surfaces

Action architecture:
- Registry and manager:
  - `packages/excalidraw/actions/register.ts`
  - `packages/excalidraw/actions/manager.tsx`
  - `packages/excalidraw/actions/types.ts`
- Action list assembly and exports:
  - `packages/excalidraw/actions/index.ts`
- Undo/redo actions bridge to history:
  - `packages/excalidraw/actions/actionHistory.tsx`

Keyboard dispatch:
- `ActionManager.handleKeyDown` sorts by priority and resolves matching `keyTest`.
- Uses `UIOptions.canvasActions` to gate action availability.
- Rejects non-view-mode actions while in view mode.

Shortcut mapping:
- `packages/excalidraw/actions/shortcuts.ts` maps action names to cross-platform shortcut strings.

UI projection:
- Actions and shape tool projection are rendered through:
  - `packages/excalidraw/components/Actions.tsx`
  - `packages/excalidraw/components/shapes.tsx`
  - `packages/excalidraw/components/LayerUI.tsx`

Implication:
- Action logic is centralized and reusable across keyboard, toolbar, menu, and API pathways.

---

## 7) Store, Delta, and History Engine (Undo/Redo Semantics)

Core state capture engine:
- `packages/element/src/store.ts`.
- Defines `CaptureUpdateAction` modes:
  - `IMMEDIATELY`: durable increment and undoable.
  - `NEVER`: ephemeral increment, updates snapshot.
  - `EVENTUALLY`: ephemeral increment, does not advance snapshot.

Micro vs macro scheduling model:
- Macro: scheduled action set per commit cycle.
- Micro: queued pre-commit actions (e.g., precomputed deltas/changes).

Delta model:
- `packages/element/src/delta.ts`.
- `Delta<T>` generic diff container, plus specialized:
  - `AppStateDelta`
  - `ElementsDelta`
  - `StoreDelta` composition.
- Includes merge/squash/apply semantics, binding conflict handling, redraw reconciliation hooks.

History model:
- `packages/excalidraw/history.ts`.
- `HistoryDelta` extends store deltas for undo/redo application.
- Durable increments are recorded; redo stack reset policy depends on element-level changes.

App integration:
- In `App.componentDidMount`, durable increments are wired into `history.record`.
- In `App.componentDidUpdate`, `store.commit` executes capture policy and emits increments.

This is a sophisticated event-sourced-like delta pipeline, not a naive snapshot stack.

---

## 8) Local-First Persistence and Cross-Tab Consistency

Local storage responsibilities:
- Data-state (`elements`, app-state) in `localStorage` with debounced writes:
  - `excalidraw-app/data/LocalData.ts`
  - `excalidraw-app/data/localStorage.ts`

Binary files (images):
- Stored via IndexedDB (`idb-keyval`) file store in LocalData file manager.
- Includes stale-file cleanup and retrieval timestamp updates.

Save lock model:
- `Locker` abstraction for pausing saves during collaboration or unsafe windows:
  - `excalidraw-app/data/Locker.ts`.

File status and export gating:
- `FileStatusStore` tracks loading/loaded/error states.
- `onExport` generator in `excalidraw-app/App.tsx` can wait for pending image loads before final export.

Cross-tab coherence:
- Browser-state version stamps in `localStorage`:
  - `excalidraw-app/data/tabSync.ts`.
- App uses version comparisons and selective hydration on visibility/focus events.

Library persistence:
- Library primary persistence via IndexedDB adapter, optional migration adapter from legacy localStorage.
- Core library logic and URL import handling in:
  - `packages/excalidraw/data/library.ts`.

TTD chat persistence:
- IndexedDB adapter:
  - `excalidraw-app/data/TTDStorage.ts`.

---

## 9) Collaboration, Encryption, and Remote Reconciliation

Collab runtime:
- Coordinator component and API:
  - `excalidraw-app/collab/Collab.tsx`.
- Socket transport wrapper:
  - `excalidraw-app/collab/Portal.tsx`.

Transport security and payload handling:
- Room-level key (`roomKey`) used for AES-GCM encryption of socket payloads.
- Encrypt/decrypt primitives from:
  - `packages/excalidraw/data/encryption.ts`.

Realtime flow:
- `Portal.broadcastScene` sends incremental/full scene updates based on version tracking.
- `Collab` receives encrypted payloads, decrypts, dispatches by subtype (`INIT`, `UPDATE`, cursor, idle, viewport).
- Reconciliation path:
  - `reconcileElements` with version/versionNonce conflict policy:
    - `packages/excalidraw/data/reconcile.ts`.

Persistence in collaboration:
- Scene snapshots persisted to Firestore via transaction merge logic:
  - `excalidraw-app/data/firebase.ts`.
- Files persisted to Firebase Storage with per-file encrypted/compressed payloads.

Link and room model:
- Room links encoded in URL hash (`#room=id,key`).
- Share links use backend id + key in hash (`#json=id,key`) to avoid key leakage via query string.

Notable policy observation:
- Firebase rules in this repo configuration are permissive (`allow get, write: if true`) with list disabled in Firestore.
- This relies on cryptographic secrecy of payload keys for confidentiality, not strict backend ACLs in these rules.

---

## 10) Import/Export, Serialization, and Data Integrity

JSON serialization:
- `packages/excalidraw/data/json.ts`.
- `serializeAsJSON` supports local/database variants and strips non-persistent state as needed.

Restore/migration path:
- `packages/excalidraw/data/restore.ts` normalizes legacy/new schema variations.
- Repairs bindings, arrow details, line properties, app state defaults, and element invariants.

Scene reconciliation:
- `packages/excalidraw/data/reconcile.ts` merges local and remote elements with deterministic conflict policy.

Binary encoding/compression:
- `packages/excalidraw/data/encode.ts` implements compress/encrypt framing and metadata wrappers.

Cryptography primitives:
- `packages/excalidraw/data/encryption.ts` uses Web Crypto AES-GCM (`A128GCM`) and random IV.

SVG payload embedding:
- `packages/excalidraw/scene/export.ts` embeds scene payload comments in SVG metadata and supports decoding round-trip.

Overall integrity model:
- Strong normalization at ingress (restore) + deterministic ordering + explicit capture policies + optional embedded metadata for export round-trips.

---

## 11) AI Extension Surfaces and Plugin Integration

Core plugin hook:
- `App.plugins` and `setPlugins` in `packages/excalidraw/components/App.tsx`.
- `DiagramToCodePlugin` bridges host `generate` function into runtime plugin state:
  - `packages/excalidraw/components/DiagramToCodePlugin/DiagramToCodePlugin.tsx`.

App-level AI composition:
- `excalidraw-app/components/AI.tsx` mounts:
  - `DiagramToCodePlugin` with frame export + backend call.
  - `TTDDialog` with streaming backend integration.

Text-to-diagram streaming:
- SSE parser and stream contract:
  - `packages/excalidraw/components/TTDDialog/utils/TTDStreamFetch.ts`.

Runtime behavior:
- Magic frame tool path in `App` can generate iframe content from selected frame children through plugin-provided generator.
- AI is an extension of runtime, not hard-coded into core rendering semantics.

---

## 12) Build, Test, Deployment, and Operational Surface

Build and workspace orchestration:
- Root scripts coordinate app and package builds:
  - `package.json`.
- Package builds use esbuild-based scripts:
  - `scripts/buildBase.js`
  - `scripts/buildPackage.js`
  - `scripts/buildUtils.js`

App bundling:
- Vite-based config with path aliases, chunk strategy, PWA config, runtime caching:
  - `excalidraw-app/vite.config.mts`.

Testing surface:
- Vitest config with aliasing and jsdom:
  - `vitest.config.mts`.
- Root test scripts include typecheck, lint, formatting, app tests.

Deployment/infrastructure:
- Docker multistage build -> nginx runtime:
  - `Dockerfile`.
- Docker compose dev mapping:
  - `docker-compose.yml`.
- Vercel headers/redirects/output directory:
  - `vercel.json`.
- Firebase config/rules:
  - `firebase-project/firebase.json`
  - `firebase-project/firestore.rules`
  - `firebase-project/storage.rules`.

Service worker migration:
- `public/service-worker.js` is a self-destruct worker to unregister legacy CRA worker and force clients to new Vite SW strategy.

Operational takeaway:
- Build/deploy stack is modernized (Vite + PWA + Docker + Vercel/Firebase) with strong frontend caching tactics and explicit migration handling.

---

## Appendix A) Quantitative Repository Inventory

Tracked file count:
- `1225` files (`git ls-files`).

Top-level distribution:
- `packages`: 970
- `dev-docs`: 71
- `excalidraw-app`: 50
- `examples`: 38
- `public`: 26
- `scripts`: 20
- `.github`: 16
- `firebase-project`: 6
- other root-level files/folders: remaining balance

`packages/*` distribution:
- `packages/excalidraw`: 815
- `packages/element`: 79
- `packages/common`: 31
- `packages/math`: 26
- `packages/utils`: 17

`excalidraw-app/*` distribution:
- `components`: 11
- `data`: 9
- `tests`: 4
- `share`: 4
- `collab`: 4
- `app-language`: 3
- root-level app files: remaining balance

`packages/excalidraw/*` hotspot distribution:
- `components`: 277
- `fonts`: 249
- `tests`: 73
- `locales`: 59
- `actions`: 47
- `data`: 15
- `hooks`: 12
- `renderer`: 8
- `scene`: 8
- remaining files: utility/runtime infrastructure

Interpretation:
- Core complexity concentrates in `packages/excalidraw/components` and runtime adjacent areas (`actions`, `scene`, `renderer`).
- Data model/consistency mechanisms are intentionally centralized in `packages/element`.
- App-specific concerns (`collab`, persistence adapters, integrations) are scoped to `excalidraw-app`.

---

## Appendix B) Notable Forensic Observations

1. Runtime architecture is engine-centric with explicit scene/store/history primitives.
2. Capture semantics (`IMMEDIATELY`/`NEVER`/`EVENTUALLY`) are a critical correctness contract and pervade local, remote, and export flows.
3. Collaboration uses end-to-end encrypted payloads and deterministic reconciliation logic, while backend rules in this repo are permissive and rely heavily on cryptographic secrecy for confidentiality.
4. Rendering is intentionally multi-layered to separate static content, interactive overlays, and in-progress creation performance concerns.
5. Export and restore subsystems include compatibility and migration machinery that preserve cross-version portability.
6. AI capabilities are pluggable and integrated through explicit plugin hooks, not fused with fundamental renderer/state internals.

---

## Appendix C) Primary Evidence File Index

Core runtime:
- `packages/excalidraw/components/App.tsx`
- `packages/excalidraw/index.tsx`
- `packages/excalidraw/types.ts`
- `packages/excalidraw/history.ts`

Renderer/export:
- `packages/excalidraw/renderer/staticScene.ts`
- `packages/excalidraw/renderer/interactiveScene.ts`
- `packages/excalidraw/renderer/renderNewElementScene.ts`
- `packages/excalidraw/renderer/staticSvgScene.ts`
- `packages/excalidraw/scene/Renderer.ts`
- `packages/excalidraw/scene/export.ts`
- `packages/excalidraw/components/canvases/StaticCanvas.tsx`
- `packages/excalidraw/components/canvases/InteractiveCanvas.tsx`
- `packages/excalidraw/components/canvases/NewElementCanvas.tsx`

Element/store/delta:
- `packages/element/src/types.ts`
- `packages/element/src/Scene.ts`
- `packages/element/src/store.ts`
- `packages/element/src/delta.ts`

Actions/input:
- `packages/excalidraw/actions/manager.tsx`
- `packages/excalidraw/actions/register.ts`
- `packages/excalidraw/actions/shortcuts.ts`
- `packages/excalidraw/actions/types.ts`
- `packages/excalidraw/actions/actionHistory.tsx`
- `packages/excalidraw/components/Actions.tsx`
- `packages/excalidraw/components/shapes.tsx`
- `packages/excalidraw/components/LayerUI.tsx`

Data/persistence/collab:
- `packages/excalidraw/data/json.ts`
- `packages/excalidraw/data/restore.ts`
- `packages/excalidraw/data/reconcile.ts`
- `packages/excalidraw/data/encode.ts`
- `packages/excalidraw/data/encryption.ts`
- `packages/excalidraw/data/library.ts`
- `excalidraw-app/App.tsx`
- `excalidraw-app/collab/Collab.tsx`
- `excalidraw-app/collab/Portal.tsx`
- `excalidraw-app/data/index.ts`
- `excalidraw-app/data/firebase.ts`
- `excalidraw-app/data/FileManager.ts`
- `excalidraw-app/data/LocalData.ts`
- `excalidraw-app/data/localStorage.ts`
- `excalidraw-app/data/tabSync.ts`
- `excalidraw-app/data/fileStatusStore.ts`
- `excalidraw-app/data/TTDStorage.ts`

AI extensions:
- `excalidraw-app/components/AI.tsx`
- `packages/excalidraw/components/DiagramToCodePlugin/DiagramToCodePlugin.tsx`
- `packages/excalidraw/components/TTDDialog/TTDDialog.tsx`
- `packages/excalidraw/components/TTDDialog/utils/TTDStreamFetch.ts`

Build/deploy/config:
- `package.json`
- `excalidraw-app/package.json`
- `excalidraw-app/vite.config.mts`
- `vitest.config.mts`
- `scripts/buildBase.js`
- `scripts/buildPackage.js`
- `scripts/buildUtils.js`
- `scripts/build-node.js`
- `scripts/build-version.js`
- `scripts/buildDocs.js`
- `Dockerfile`
- `docker-compose.yml`
- `vercel.json`
- `firebase-project/firebase.json`
- `firebase-project/firestore.rules`
- `firebase-project/storage.rules`
- `public/service-worker.js`
- `public/_headers`

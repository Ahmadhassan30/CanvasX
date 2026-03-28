// Full Excalidraw element type definitions
// Based on packages/element/src/types.ts in the main Excalidraw repo

export type StrokeStyle = "solid" | "dashed" | "dotted";
export type FillStyle = "hachure" | "cross-hatch" | "solid" | "zigzag";
export type TextAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";
export type RoundnessType = 1 | 2 | 3;
export type Arrowhead =
  | "arrow"
  | "bar"
  | "circle"
  | "circle_outline"
  | "triangle"
  | "triangle_outline"
  | "diamond"
  | "diamond_outline"
  | null;

export interface Roundness {
  type: RoundnessType;
  value?: number;
}

export interface ExcalidrawBaseElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: Roundness | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: Array<{
    id: string;
    type: "arrow" | "text";
  }> | null;
  updated: number;
  link: string | null;
  locked: boolean;
  customData?: Record<string, unknown>;
}

export interface ExcalidrawRectangleElement extends ExcalidrawBaseElement {
  type: "rectangle";
}

export interface ExcalidrawDiamondElement extends ExcalidrawBaseElement {
  type: "diamond";
}

export interface ExcalidrawEllipseElement extends ExcalidrawBaseElement {
  type: "ellipse";
}

export interface ExcalidrawTextElement extends ExcalidrawBaseElement {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: 1 | 2 | 3 | 4; // 1=Virgil, 2=Helvetica, 3=Cascadia, 4=Assistant
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
  containerId: string | null;
  originalText: string;
  autoResize: boolean;
  lineHeight: number;
}

export interface PointBinding {
  elementId: string;
  focus: number;
  gap: number;
  fixedPoint?: [number, number] | null;
}

export interface ExcalidrawLinearElement extends ExcalidrawBaseElement {
  type: "line" | "arrow";
  points: Array<[number, number]>;
  lastCommittedPoint?: [number, number] | null;
  startBinding: PointBinding | null;
  endBinding: PointBinding | null;
  startArrowhead: Arrowhead;
  endArrowhead: Arrowhead;
  elbowed?: boolean;
}

export interface ExcalidrawArrowElement extends ExcalidrawLinearElement {
  type: "arrow";
}

export interface ExcalidrawLineElement extends ExcalidrawLinearElement {
  type: "line";
}

export interface ExcalidrawFrameElement extends ExcalidrawBaseElement {
  type: "frame";
  name: string | null;
  isCollapsed?: boolean;
}

export interface ExcalidrawMagicFrameElement extends ExcalidrawBaseElement {
  type: "magicframe";
  name: string | null;
  isCollapsed?: boolean;
}

export interface ExcalidrawFreeDrawElement extends ExcalidrawBaseElement {
  type: "freedraw";
  points: Array<[number, number]>;
  pressures: number[];
  simulatePressure: boolean;
  lastCommittedPoint?: [number, number] | null;
}

export interface ExcalidrawImageElement extends ExcalidrawBaseElement {
  type: "image";
  fileId: string | null;
  status: "pending" | "saved" | "error";
  scale: [number, number];
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
  } | null;
}

export interface ExcalidrawEmbeddableElement extends ExcalidrawBaseElement {
  type: "embeddable";
  validated: boolean | null;
}

export interface ExcalidrawIframeElement extends ExcalidrawBaseElement {
  type: "iframe";
}

// Union type covering all concrete element types
export type ExcalidrawElement =
  | ExcalidrawRectangleElement
  | ExcalidrawDiamondElement
  | ExcalidrawEllipseElement
  | ExcalidrawTextElement
  | ExcalidrawArrowElement
  | ExcalidrawLineElement
  | ExcalidrawFrameElement
  | ExcalidrawMagicFrameElement
  | ExcalidrawFreeDrawElement
  | ExcalidrawImageElement
  | ExcalidrawEmbeddableElement
  | ExcalidrawIframeElement;

// Partial AppState shape relevant for updateScene()
export interface PartialAppState {
  viewBackgroundColor?: string;
  zoom?: { value: number };
  scrollX?: number;
  scrollY?: number;
  currentItemStrokeColor?: string;
  currentItemBackgroundColor?: string;
  currentItemFillStyle?: FillStyle;
  currentItemStrokeWidth?: number;
  currentItemStrokeStyle?: StrokeStyle;
  currentItemRoughness?: number;
  currentItemOpacity?: number;
  currentItemFontFamily?: number;
  currentItemFontSize?: number;
  currentItemTextAlign?: TextAlign;
  currentItemStartArrowhead?: Arrowhead;
  currentItemEndArrowhead?: Arrowhead;
  gridSize?: number | null;
  theme?: "light" | "dark";
  name?: string;
}

// Shape of the full scene payload for updateScene()
export interface ExcalidrawSceneUpdate {
  elements: ExcalidrawElement[];
  appState?: PartialAppState;
  collaborators?: Map<string, unknown>;
}

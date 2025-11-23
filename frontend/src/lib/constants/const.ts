import type { HoverBorder, ToolBorder } from "$lib/types/tools";

export const DEFAULT_CAMERA_ZOOM = 0.5;
export const MIN_CAMERA_ZOOM = 0.2;
export const MAX_CAMERA_ZOOM = 10;

export const DEFAULT_HOVER_BORDER : HoverBorder = {
	color: { r: 255, g: 0, b: 0, a: 1 },
	borderWidth: 4,
	minBorderWidth: 4
};

export const DEFAULT_TOOL_BORDER: ToolBorder = {
	color: { r: 0, g: 0, b:255, a: 1 },
	borderWidth: 4,
	minBorderWidth: 4,
	x: 0,
	y: 0,
	width: 0,
	height: 0,
	circleRadius: 12,
	minCircleRadius: 12,
};

// Performance constants
export const HOVER_CHECK_DELAY = 16; // ~60fps

// Editor constants
export const INVALID_INDEX = -1;
export const ZOOM_IN_FACTOR = 1.1;
export const ZOOM_OUT_FACTOR = 0.9;

// Cursor styles
export const CURSOR_DEFAULT = 'default';
export const CURSOR_POINTER = 'pointer';
export const CURSOR_GRAB = 'grab';
export const CURSOR_GRABBING = 'grabbing';


export type FontDescription = {
  runtimeFileName: string;
  fontName: string;
};

export const fonts: FontDescription[] = [
  // {
  //   filePath: "node_modules/@fontsource/inter/files/inter-all-400-normal.woff",
  //   runtimeFileName: "inter-regular.woff",
  //   fontName: "Inter",
  // },
  {
    runtimeFileName: "noto-sans-latin-standard-normal.woff2",
    fontName: "Noto Sans",
  },
  // {
  //   filePath:
  //     "node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff",
  //   runtimeFileName: "noto-sans-jp-regular.woff",
  //   fontName: "Noto Sans JP",
  // },
  // {
  //   filePath:
  //     "vendors/noto-sans-hebrew/instance_ttf/NotoSansHebrew-Regular.ttf",
  //   runtimeFileName: "noto-sans-hebrew-regular.ttf",
  //   fontName: "Noto Sans Hebrew",
  // },
  // {
  //   filePath:
  //     "node_modules/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2",
  //   runtimeFileName: "noto-sans-sc-regular.woff2",
  //   fontName: "Noto Sans SC",
  // }
];

export const fontFamilies = fonts.map((x) => x.fontName);
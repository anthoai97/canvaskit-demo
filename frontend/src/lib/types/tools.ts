import type { RGBA } from "./color";

export interface HoverBorder {
		color: RGBA;
		borderWidth: number;
		minBorderWidth: number;
}

export interface ToolBorder extends HoverBorder {
	x: number;
	y: number;
	width: number;
	height: number;
	circleRadius: number;
	minCircleRadius: number;
}
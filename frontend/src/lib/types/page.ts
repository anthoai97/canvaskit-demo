import type { RGBA } from './color';

// Describes how the editor page background should be rendered.
// Starts as a simple solid color, but can be expanded to gradients, images, etc.
export interface PageBackground {
	color: RGBA;
}

export interface EditorPage {
	width: number;
	height: number;
	background: PageBackground;
}
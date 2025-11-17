import type { RGBA } from './color';
import type { Shape } from './shape';

// Describes how the editor page background should be rendered.
// Starts as a simple solid color, but can be expanded to gradients, images, etc.
export interface PageBackground {
	color: RGBA;
}

export interface EditorPage {
	id: string;
	width: number;
	height: number;
	background: PageBackground;
	shapes: Shape[];
}

// Document/Project that contains multiple pages
export interface EditorDocument {
	id?: string;
	pages: EditorPage[];
}
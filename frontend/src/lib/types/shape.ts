import type { Image } from 'canvaskit-wasm';

/**
 * Concrete shape type for bitmap images.
 */
export interface ImageShape {
	kind: 'image';
	x: number;
	y: number;
	width: number;
	height: number;
	url: string;
	image: Image | null;
	ratio: number;
	rotate: number | null;
	// Optional client-side state: when this image started fading in (ms, performance.now()).
	fadeInStart?: number | null;
}

/**
 * Concrete shape type for text content.
 *
 * Shares the same geometric properties as other shapes, but has its own
 * text styling configuration instead of image properties.
 */
export interface TextShape {
	kind: 'text';

	// Geometry
	x: number;
	y: number;
	width: number;
	height: number;
	rotate: number | null;

	// Text styling
	text: string;
	fontSize: number;
	fontFamily: string;
	fontWeight: number;
	fontStyle: string;
	fontColor: string;
	fontOpacity: number;
}

/**
 * Abstract shape type – represents any shape in the editor (image, text, ...).
 */
export type Shape = ImageShape | TextShape;
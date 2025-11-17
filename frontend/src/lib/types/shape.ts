import type { Image } from 'canvaskit-wasm';

/**
 * Animation configuration for shapes.
 * Controls how shapes appear when first loaded or when animation is triggered.
 */
export interface ShapeAnimation {
	type: 'wipe' | 'fade' | 'raise' | 'pan' | 'none';
	duration?: number; // ms, defaults to 300 if not specified
	delay?: number; // ms, delay before animation starts (defaults to 0)
	// For 'pan' animation: 'left' | 'right' (defaults to 'left')
	direction?: 'left' | 'right';
}

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
	animation?: ShapeAnimation;
	// Optional client-side state: when this image started animating (ms, performance.now()).
	animationStart?: number | null;
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

	// Animation
	animation?: ShapeAnimation;
	// Optional client-side state: when this text started animating (ms, performance.now()).
	animationStart?: number | null;
}

/**
 * Abstract shape type – represents any shape in the editor (image, text, ...).
 */
export type Shape = ImageShape | TextShape;
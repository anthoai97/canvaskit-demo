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
 * Base interface for shared properties
 */
interface BaseShape {
	id?: number;
	x: number;
	y: number;
	width: number;
	height: number;
	rotate: number | null;
	animation?: ShapeAnimation;
	animationStart?: number | null;
}

/**
 * Concrete shape type for bitmap images.
 */
export interface ImageShape extends BaseShape {
	kind: 'image';
	url: string;
	image: Image | null;
	ratio: number;
}

/**
 * Concrete shape type for text content.
 */
export interface TextShape extends BaseShape {
	kind: 'text';
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

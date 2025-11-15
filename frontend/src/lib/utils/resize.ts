import type { Shape } from '$lib/types/shape';
import { DEFAULT_TOOL_BORDER } from '$lib/contants/const';
import { isPointInCircle } from './hit-test';

export type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * Calculates the resize circle radius based on zoom
 */
export const getResizeCircleRadius = (zoom: number): number => {
	let circleRadius = DEFAULT_TOOL_BORDER.circleRadius * zoom < DEFAULT_TOOL_BORDER.circleRadius 
		? DEFAULT_TOOL_BORDER.circleRadius 
		: DEFAULT_TOOL_BORDER.circleRadius * zoom;
	const minCircleRadius = DEFAULT_TOOL_BORDER.minCircleRadius * zoom < DEFAULT_TOOL_BORDER.minCircleRadius 
		? DEFAULT_TOOL_BORDER.minCircleRadius 
		: DEFAULT_TOOL_BORDER.minCircleRadius * zoom;
	if (circleRadius < minCircleRadius) {
		circleRadius = minCircleRadius;
	}
	return circleRadius;
};

/**
 * Gets the corner positions of a shape
 */
export const getShapeCorners = (shape: Shape) => {
	return {
		'top-left': { x: shape.x, y: shape.y },
		'top-right': { x: shape.x + shape.width, y: shape.y },
		'bottom-left': { x: shape.x, y: shape.y + shape.height },
		'bottom-right': { x: shape.x + shape.width, y: shape.y + shape.height }
	};
};

/**
 * Checks which resize corner (if any) is being hovered
 */
export const getHoveredResizeCorner = (
	point: { x: number; y: number },
	shape: Shape,
	zoom: number
): ResizeCorner | null => {
	const radius = getResizeCircleRadius(zoom);
	const corners = getShapeCorners(shape);

	// Check corners in order (top-right, bottom-right, bottom-left, top-left)
	// This ensures we check the most visible corners first
	const cornerOrder: ResizeCorner[] = [
		'top-right',
		'bottom-right',
		'bottom-left',
		'top-left'
	];

	for (const cornerName of cornerOrder) {
		const corner = corners[cornerName];
		if (isPointInCircle(point, corner.x, corner.y, radius)) {
			return cornerName;
		}
	}

	return null;
};

/**
 * Gets the anchor point (opposite corner) for a given resize corner
 */
export const getAnchorPoint = (
	corner: ResizeCorner,
	shape: Shape
): { x: number; y: number } => {
	switch (corner) {
		case 'top-left':
			return { x: shape.x + shape.width, y: shape.y + shape.height }; // bottom-right
		case 'top-right':
			return { x: shape.x, y: shape.y + shape.height }; // bottom-left
		case 'bottom-left':
			return { x: shape.x + shape.width, y: shape.y }; // top-right
		case 'bottom-right':
			return { x: shape.x, y: shape.y }; // top-left
	}
};

/**
 * Calculates new dimensions maintaining aspect ratio from anchor point to mouse position
 */
export const calculateDimensionsFromAnchor = (
	anchor: { x: number; y: number },
	mousePos: { x: number; y: number },
	aspectRatio: number
): { width: number; height: number } => {
	const dx = mousePos.x - anchor.x;
	const dy = mousePos.y - anchor.y;
	const absDx = Math.abs(dx);
	const absDy = Math.abs(dy);

	// Use the larger absolute delta to maintain aspect ratio
	if (absDx > absDy) {
		return {
			width: absDx,
			height: absDx / aspectRatio
		};
	} else {
		return {
			width: absDy * aspectRatio,
			height: absDy
		};
	}
};

/**
 * Calculates position from anchor point and dimensions based on resize corner
 */
export const calculatePositionFromAnchor = (
	corner: ResizeCorner,
	anchor: { x: number; y: number },
	width: number,
	height: number
): { x: number; y: number } => {
	switch (corner) {
		case 'top-left':
			return { x: anchor.x - width, y: anchor.y - height };
		case 'top-right':
			return { x: anchor.x, y: anchor.y - height };
		case 'bottom-left':
			return { x: anchor.x - width, y: anchor.y };
		case 'bottom-right':
			return { x: anchor.x, y: anchor.y };
	}
};

/**
 * Applies minimum size constraints while maintaining aspect ratio
 */
export const applyMinSizeConstraints = (
	width: number,
	height: number,
	aspectRatio: number,
	minSize: number = 10
): { width: number; height: number } => {
	if (width >= minSize && height >= minSize) {
		return { width, height };
	}

	// Use the larger dimension to ensure both meet minimum
	if (width < height) {
		const newHeight = Math.max(height, minSize);
		return {
			width: newHeight * aspectRatio,
			height: newHeight
		};
	} else {
		const newWidth = Math.max(width, minSize);
		return {
			width: newWidth,
			height: newWidth / aspectRatio
		};
	}
};


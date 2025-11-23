import type { Shape } from '$lib/types/shape';
import { DEFAULT_TOOL_BORDER } from '$lib/constants/const';
import { isPointInCircle } from './hit-test';
import {
	type Point,
	getShapeCenter,
	worldToLocalSpace,
	rotatePoint,
	degToRad,
	radToDeg
} from './transform';

/**
 * Rotate circle offset from top of shape (in world coordinates)
 * This must match the visual rendering in drawing.ts: y - (30 / zoom)
 * At zoom 1.0, this is 30 pixels above the shape
 */
const ROTATE_CIRCLE_OFFSET = 30;

export type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type CardinalDirection = 'n' | 'e' | 's' | 'w';

/**
 * Calculates the resize circle radius based on zoom
 * This returns the radius in WORLD SPACE for hit detection
 * The visual circle on screen is always at least minCircleRadius pixels,
 * but in world space at low zoom levels, this means a larger world-space radius
 */
export const getResizeCircleRadius = (zoom: number): number => {
	// The visual circle is max(circleRadius * zoom, minCircleRadius) pixels on screen
	// To convert to world space, we divide by zoom
	const visualRadius = Math.max(
		DEFAULT_TOOL_BORDER.circleRadius * zoom,
		DEFAULT_TOOL_BORDER.minCircleRadius
	);

	// Convert screen pixels to world space
	const worldRadius = visualRadius / zoom;

	return worldRadius;
};

/**
 * Gets the corner positions of a shape
 */
export const getShapeCorners = (shape: Shape): Record<ResizeCorner, Point> => {
	return {
		'top-left': { x: shape.x, y: shape.y },
		'top-right': { x: shape.x + shape.width, y: shape.y },
		'bottom-left': { x: shape.x, y: shape.y + shape.height },
		'bottom-right': { x: shape.x + shape.width, y: shape.y + shape.height }
	};
};

/**
 * Gets the rotate circle position for a shape
 * @param shape - The shape
 * @param rotation - Rotation in degrees (null or 0 means no rotation)
 * @returns The rotate circle center position
 */
export const getRotateCirclePosition = (
	shape: Shape,
	rotation: number | null = null
): Point => {
	const centerX = shape.x + shape.width / 2;
	const centerY = shape.y - ROTATE_CIRCLE_OFFSET;

	// If shape is rotated, rotate the circle position around the shape center
	if (rotation !== null && rotation !== 0) {
		const shapeCenter = getShapeCenter(shape);
		const rotatedPos = rotatePoint({ x: centerX, y: centerY }, shapeCenter, rotation);
		return rotatedPos;
	}

	return { x: centerX, y: centerY };
};

/**
 * Checks if a point is hovering over the rotate circle
 * @param point - Point coordinates in world space
 * @param shape - The shape
 * @param zoom - Current zoom level
 * @param rotation - Rotation in degrees (null or 0 means no rotation)
 * @returns True if point is hovering over the rotate circle
 */
export const isHoveringRotateCircle = (
	point: Point,
	shape: Shape,
	zoom: number,
	rotation: number | null = null
): boolean => {
	const radius = getResizeCircleRadius(zoom);

	// Get the circle position - MUST match drawing.ts line 133: y - (30 / zoom)
	const centerX = shape.x + shape.width / 2;
	const centerY = shape.y - (30 / zoom); // Match visual rendering exactly

	// Transform point to local space (same as getHoveredResizeCorner does)
	const transformedPoint = worldToLocalSpace(point, shape, rotation);

	// Check in local space (same as getHoveredResizeCorner does)
	const result = isPointInCircle(transformedPoint, centerX, centerY, radius);

	return result;
};

/**
 * Checks which resize corner (if any) is being hovered
 */
export const getHoveredResizeCorner = (
	point: Point,
	shape: Shape,
	zoom: number,
	rotation: number | null = null
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

	// If shape is rotated, transform point to shape's local coordinate space
	const transformedPoint = worldToLocalSpace(point, shape, rotation);

	for (const cornerName of cornerOrder) {
		const corner = corners[cornerName];
		if (isPointInCircle(transformedPoint, corner.x, corner.y, radius)) {
			return cornerName;
		}
	}

	return null;
};

/**
 * Default corner direction mapping (for unrotated shapes)
 */
const DEFAULT_CORNER_DIRECTIONS: Record<ResizeCorner, CardinalDirection> = {
	'top-left': 'n',
	'top-right': 'e',
	'bottom-left': 'w',
	'bottom-right': 's'
};

/**
 * Maps an angle (in degrees) to the nearest cardinal direction
 */
const angleToCardinalDirection = (angle: number): CardinalDirection => {
	// Normalize angle to 0-360
	const normalizedAngle = angle < 0 ? angle + 360 : angle;

	// Map angle to nearest cardinal direction
	// North: 270° ± 45° (225° to 315°)
	// East: 0° ± 45° (315° to 45°)
	// South: 90° ± 45° (45° to 135°)
	// West: 180° ± 45° (135° to 225°)
	if (normalizedAngle >= 315 || normalizedAngle < 45) {
		return 'e'; // East/Right
	} else if (normalizedAngle >= 45 && normalizedAngle < 135) {
		return 's'; // South/Down
	} else if (normalizedAngle >= 135 && normalizedAngle < 225) {
		return 'w'; // West/Left
	} else {
		return 'n'; // North/Up
	}
};

/**
 * Gets the actual visual direction of a corner after rotation
 * @param corner - The corner name
 * @param shape - The shape
 * @param rotation - Rotation in degrees (null or 0 means no rotation)
 * @returns The cardinal direction
 */
export const getCornerDirection = (
	corner: ResizeCorner,
	shape: Shape,
	rotation: number | null = null
): CardinalDirection => {
	if (rotation === null || rotation === 0) {
		return DEFAULT_CORNER_DIRECTIONS[corner];
	}

	const center = getShapeCenter(shape);
	const corners = getShapeCorners(shape);
	const cornerPos = corners[corner];

	// Get corner position relative to center (in local/unrotated space)
	const localDx = cornerPos.x - center.x;
	const localDy = cornerPos.y - center.y;

	// Apply rotation to get visual position
	const rotatedCorner = rotatePoint(cornerPos, center, rotation);

	// Calculate angle from center to rotated corner
	const visualDx = rotatedCorner.x - center.x;
	const visualDy = rotatedCorner.y - center.y;
	const angle = radToDeg(Math.atan2(visualDy, visualDx));

	return angleToCardinalDirection(angle);
};

/**
 * Gets the anchor point (opposite corner) for a given resize corner
 */
export const getAnchorPoint = (corner: ResizeCorner, shape: Shape): Point => {
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
	anchor: Point,
	mousePos: Point,
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
	anchor: Point,
	width: number,
	height: number
): Point => {
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


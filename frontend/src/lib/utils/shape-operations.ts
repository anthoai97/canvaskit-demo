import type { Shape } from '$lib/types/shape';
import type { Point } from './transform';
import type { ResizeCorner } from './resize';
import type { ResizeState, RotationState } from '$lib/types/editor';
import {
	getAnchorPoint,
	calculateDimensionsFromAnchor,
	calculatePositionFromAnchor,
	applyMinSizeConstraints
} from './resize';
import { worldToLocalSpace, getShapeCenter, getAngleToPoint, calculateRotationDelta } from './transform';

/**
 * Initializes rotation state for a shape
 */
export const initializeRotation = (
	shape: Shape,
	mouseWorldPos: Point
): RotationState => {
	const shapeCenter = getShapeCenter(shape);
	const initialAngle = getAngleToPoint(mouseWorldPos, shapeCenter);
	return {
		initialRotation: shape.rotate ?? 0,
		initialAngle
	};
};

/**
 * Calculates new rotation for a shape based on mouse movement
 */
export const calculateRotation = (
	rotationState: RotationState,
	mouseWorldPos: Point,
	shapeCenter: Point
): number => {
	const currentAngle = getAngleToPoint(mouseWorldPos, shapeCenter);
	const rotationDelta = calculateRotationDelta(rotationState.initialAngle, currentAngle);
	let newRotation = rotationState.initialRotation + rotationDelta;

	// Normalize rotation to 0-360 range
	if (newRotation < 0) {
		newRotation += 360;
	} else if (newRotation >= 360) {
		newRotation -= 360;
	}

	return newRotation;
};

/**
 * Initializes resize state for a shape
 */
export const initializeResize = (
	shape: Shape,
	mouseWorldPos: Point
): ResizeState => ({
	shape: { ...shape }, // Copy shape state
	startMousePos: mouseWorldPos,
	aspectRatio: shape.width / shape.height
});

/**
 * Calculates new dimensions and position for resizing a shape
 */
export const calculateResize = (
	resizeState: ResizeState,
	corner: ResizeCorner,
	mouseWorldPos: Point,
	rotation: number | null
): { x: number; y: number; width: number; height: number } => {
	// Transform mouse position to local coordinate space (unrotated)
	const localMousePos = worldToLocalSpace(mouseWorldPos, resizeState.shape, rotation);

	// Get anchor point (opposite corner) in local space
	const anchor = getAnchorPoint(corner, resizeState.shape);

	// Maintain aspect ratio for all shapes (including text shapes)
	let { width, height } = calculateDimensionsFromAnchor(
		anchor,
		localMousePos,
		resizeState.aspectRatio
	);

	// Apply minimum size constraints while keeping aspect ratio
	({ width, height } = applyMinSizeConstraints(
		width,
		height,
		resizeState.aspectRatio
	));

	// Calculate new position from anchor point
	const { x, y } = calculatePositionFromAnchor(corner, anchor, width, height);

	return { x, y, width, height };
};


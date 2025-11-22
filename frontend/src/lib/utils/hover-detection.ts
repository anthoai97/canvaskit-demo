import type { Point } from './transform';
import type { Shape } from '$lib/types/shape';
import { INVALID_INDEX } from '$lib/contants/const';
import { findShapeAtPoint } from './hit-test';
import {
	getHoveredResizeCorner,
	isHoveringRotateCircle,
	type ResizeCorner
} from './resize';
import type { HoverState } from './hover-state';

export interface HoverDetectionResult {
	shapeIndex: number;
	resizeCorner: ResizeCorner | null;
	isHoveringRotateCircle: boolean;
}

/**
 * Detects what the mouse is hovering over
 * Priority: rotate circle > resize corner > shape
 */
export const detectHover = (
	worldPos: Point,
	shapes: Shape[],
	selectedShapeIndex: number,
	zoom: number,
	isValidShapeIndex: (index: number) => boolean
): HoverDetectionResult => {
	const result: HoverDetectionResult = {
		shapeIndex: INVALID_INDEX,
		resizeCorner: null,
		isHoveringRotateCircle: false
	};

	// Check selected shape's rotate circle and resize corners first
	if (isValidShapeIndex(selectedShapeIndex)) {
		const selectedShape = shapes[selectedShapeIndex];
		const rotation = selectedShape.rotate ?? null;

		// Check rotate circle first (highest priority)
		result.isHoveringRotateCircle = isHoveringRotateCircle(
			worldPos,
			selectedShape,
			zoom,
			rotation
		);

		console.log('[Hover Detection] Rotate circle check:', result.isHoveringRotateCircle);

		// Only check resize corners if not hovering over rotate circle
		if (!result.isHoveringRotateCircle) {
			result.resizeCorner = getHoveredResizeCorner(
				worldPos,
				selectedShape,
				zoom,
				rotation
			);
		}
	}

	// Only check for shape hover if not hovering over rotate circle or resize corner
	if (!result.isHoveringRotateCircle && result.resizeCorner === null) {
		const foundShapeIndex = findShapeAtPoint(worldPos, shapes);
		// If hovering over the selected shape itself, don't set hover state
		// This prevents the selection from being affected when hovering over the selected shape
		// Only show hover state for other shapes
		if (foundShapeIndex !== selectedShapeIndex) {
			result.shapeIndex = foundShapeIndex;
		} else {
			// Keep hover state invalid when hovering over selected shape
			// This ensures selection remains intact and visual feedback is correct
			result.shapeIndex = INVALID_INDEX;
		}
	}

	return result;
};

/**
 * Updates hover state if there are changes
 * @returns true if state was updated
 */
export const updateHoverState = (
	currentState: HoverState,
	newState: HoverDetectionResult
): boolean => {
	let needsUpdate = false;

	if (currentState.shapeIndex !== newState.shapeIndex) {
		currentState.shapeIndex = newState.shapeIndex;
		needsUpdate = true;
	}

	if (currentState.resizeCorner !== newState.resizeCorner) {
		currentState.resizeCorner = newState.resizeCorner;
		needsUpdate = true;
	}

	if (currentState.isHoveringRotateCircle !== newState.isHoveringRotateCircle) {
		currentState.isHoveringRotateCircle = newState.isHoveringRotateCircle;
		needsUpdate = true;
	}

	return needsUpdate;
};


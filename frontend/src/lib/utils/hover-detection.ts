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
		result.shapeIndex = findShapeAtPoint(worldPos, shapes);
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


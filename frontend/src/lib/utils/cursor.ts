import {
	CURSOR_DEFAULT,
	CURSOR_POINTER,
	CURSOR_GRAB,
	CURSOR_GRABBING
} from '$lib/constants/const';
import type { ResizeCorner, CardinalDirection } from './resize';

export { CURSOR_DEFAULT };

export type CursorStyle =
	| typeof CURSOR_DEFAULT
	| typeof CURSOR_POINTER
	| typeof CURSOR_GRAB
	| typeof CURSOR_GRABBING
	| 'ns-resize'
	| 'ew-resize'
	| 'nwse-resize'
	| 'nesw-resize';

/**
 * Maps cardinal direction to CSS cursor style
 */
const DIRECTION_TO_CURSOR: Record<CardinalDirection, CursorStyle> = {
	n: 'ns-resize',
	e: 'ew-resize',
	s: 'ns-resize',
	w: 'ew-resize'
};

/**
 * Maps corner to diagonal cursor style (for unrotated shapes)
 */
const CORNER_TO_DIAGONAL_CURSOR: Record<ResizeCorner, CursorStyle> = {
	'top-left': 'nwse-resize',
	'top-right': 'nesw-resize',
	'bottom-left': 'nesw-resize',
	'bottom-right': 'nwse-resize'
};

/**
 * Gets the cursor style for a resize corner direction
 * @param direction - The cardinal direction
 * @param corner - The resize corner (optional, used when rotation is null/zero)
 * @param rotation - The rotation in degrees (null or 0 means use diagonal cursor)
 */
export const getResizeCursor = (
	direction: CardinalDirection,
	corner?: ResizeCorner,
	rotation?: number | null
): CursorStyle => {
	// If rotation is null or zero, use diagonal cursors based on corner
	if ((rotation === null || rotation === 0) && corner !== undefined) {
		return CORNER_TO_DIAGONAL_CURSOR[corner];
	}
	// Otherwise, use cardinal direction cursors
	return DIRECTION_TO_CURSOR[direction];
};

/**
 * Determines the appropriate cursor style based on editor state
 */
export const getCursorStyle = (options: {
	isPanning: boolean;
	isMouseDown: boolean;
	isDragging: boolean;
	hoveredResizeCorner: ResizeCorner | null;
	resizeDirection: CardinalDirection | null;
	hasHoveredShape: boolean;
	rotation?: number | null;
}): CursorStyle => {
	const {
		isPanning,
		isMouseDown,
		isDragging,
		hoveredResizeCorner,
		resizeDirection,
		hasHoveredShape,
		rotation
	} = options;

	if (isPanning) {
		return isMouseDown ? CURSOR_GRABBING : CURSOR_GRAB;
	}

	if (hoveredResizeCorner !== null && resizeDirection !== null) {
		return getResizeCursor(resizeDirection, hoveredResizeCorner, rotation);
	}

	if (hasHoveredShape) {
		return isDragging ? CURSOR_GRABBING : CURSOR_POINTER;
	}

	return CURSOR_DEFAULT;
};


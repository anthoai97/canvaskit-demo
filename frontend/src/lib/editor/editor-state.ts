import type { CameraState } from '$lib/types/camera';
import type { MouseState } from '$lib/types/mouse';
import type { EditorDocument, EditorPage } from '$lib/types/page';
import type { Shape } from '$lib/types/shape';
import type { SelectedShape, ResizeState, RotationState } from '$lib/types/editor';
import type { HoverState } from '$lib/utils/hover-state';
import type { ResizeCorner } from '$lib/utils/resize';
import { createHoverState, resetHoverState } from '$lib/utils/hover-state';
import { createSelectedShape, resetSelectedShape } from '$lib/types/editor';
import { DEFAULT_CAMERA_ZOOM } from '$lib/constants/const';

/**
 * Groups all editor state into a single object for better organization
 */
export interface EditorState {
	// Document and page state
	document: EditorDocument | null;
	currentPageIndex: number;
	page: EditorPage | null;
	shapes: Shape[];

	// UI state
	canvasCursor: string;
	hoverState: HoverState;
	selectedShape: SelectedShape;
	resizingCorner: ResizeCorner | null;
	resizeStartState: ResizeState | null;
	rotationStartState: RotationState | null;

	// Camera and mouse state
	cameraState: CameraState;
	mouseState: MouseState;

	// Auto-play state
	isAutoPlaying: boolean;
	wasAnimating: boolean;

	// Clipboard
	clipboard: Shape | null;

	// History
	history: Shape[][];
}

/**
 * Creates initial editor state
 */
export function createEditorState(centerX: number, centerY: number): EditorState {
	return {
		document: null,
		currentPageIndex: 0,
		page: null,
		shapes: [],

		canvasCursor: 'default',
		hoverState: createHoverState(),
		selectedShape: createSelectedShape(),
		resizingCorner: null,
		resizeStartState: null,
		rotationStartState: null,

		cameraState: {
			zoom: DEFAULT_CAMERA_ZOOM,
			panX: centerX,
			panY: centerY,
			isPanning: false
		},

		mouseState: {
			isMouseDown: false,
			isDragging: false,
			lastMouseX: 0,
			lastMouseY: 0
		},

		isAutoPlaying: false,
		wasAnimating: false,
		clipboard: null,
		history: []
	};
}

/**
 * Resets selection and related state
 */
export function clearSelection(state: EditorState): void {
	resetSelectedShape(state.selectedShape);
	resetHoverState(state.hoverState);
	state.resizingCorner = null;
	state.resizeStartState = null;
	state.rotationStartState = null;
}


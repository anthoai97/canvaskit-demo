import type { CameraState } from '$lib/types/camera';
import type { MouseState } from '$lib/types/mouse';
import type { Shape } from '$lib/types/shape';
import type { SelectedShape, ResizeState, RotationState } from '$lib/types/editor';
import type { HoverState } from '$lib/utils/hover-state';
import type { ResizeCorner } from '$lib/utils/resize';
import { getMousePosition, screenToWorld } from '$lib/utils/coordinates';
import { findShapeAtPoint } from '$lib/utils/hit-test';
import { detectHover, updateHoverState } from '$lib/utils/hover-detection';
import { resetHoverState } from '$lib/utils/hover-state';
import { getCornerDirection } from '$lib/utils/resize';
import { calculateResize, calculateRotation, initializeResize, initializeRotation } from '$lib/utils/shape-operations';
import { getShapeCenter } from '$lib/utils/transform';
import { CURSOR_GRAB, CURSOR_GRABBING, HOVER_CHECK_DELAY, INVALID_INDEX, MAX_CAMERA_ZOOM, MIN_CAMERA_ZOOM, ZOOM_IN_FACTOR, ZOOM_OUT_FACTOR } from '$lib/constants/const';
import { CURSOR_DEFAULT, getCursorStyle } from '$lib/utils/cursor';

export interface EventHandlerContext {
	canvas: HTMLCanvasElement;
	editor: HTMLDivElement;
	shapes: Shape[];
	cameraState: CameraState;
	mouseState: MouseState;
	hoverState: HoverState;
	selectedShape: SelectedShape;
	resizingCorner: ResizeCorner | null;
	resizeStartState: ResizeState | null;
	rotationStartState: RotationState | null;
	isValidShapeIndex: (index: number) => boolean;
	isTextEditing: () => boolean;
	onCursorUpdate: (cursor: string) => void;
	onScheduleDraw: () => void;
	onPanning: (deltaX: number, deltaY: number) => void;
	onShapeDrag: (shapeIndex: number, deltaX: number, deltaY: number) => void;
	onShapeResize: (shapeIndex: number, x: number, y: number, width: number, height: number) => void;
	onShapeRotate: (shapeIndex: number, rotation: number) => void;
	onSelectionChange: (shapeIndex: number) => void;
	onSelectionClear: () => void;
	onResizingCornerChange: (corner: ResizeCorner | null) => void;
	onResizeStartStateChange: (state: ResizeState | null) => void;
	onRotationStartStateChange: (state: RotationState | null) => void;
	onTransformEnd: () => void;
	onCopy: () => void;
	onPaste: () => void;
	onUndo: () => void;
	onDelete: () => void;
	onShapeDoubleClick: (shapeIndex: number, worldX: number, worldY: number) => void;
	onStopTextEditing: () => void;
}



/**
 * Updates cursor style based on current state
 */
export function updateCursor(context: EventHandlerContext): void {
	const { hoverState, selectedShape, shapes, mouseState, cameraState, isValidShapeIndex, onCursorUpdate } = context;

	// If hovering over rotate circle of selected shape, use grab cursor
	if (hoverState.isHoveringRotateCircle && isValidShapeIndex(selectedShape.index)) {
		onCursorUpdate(mouseState.isMouseDown ? CURSOR_GRABBING : CURSOR_GRAB);
		return;
	}

	let resizeDirection: ReturnType<typeof getCornerDirection> | null = null;
	let rotation: number | null = null;

	if (hoverState.resizeCorner !== null && isValidShapeIndex(selectedShape.index)) {
		const selectedShapeData = shapes[selectedShape.index];
		rotation = selectedShapeData.rotate ?? null;
		resizeDirection = getCornerDirection(hoverState.resizeCorner, selectedShapeData, rotation);
	}

	const cursor = getCursorStyle({
		isPanning: cameraState.isPanning,
		isMouseDown: mouseState.isMouseDown,
		isDragging: mouseState.isDragging,
		hoveredResizeCorner: hoverState.resizeCorner,
		resizeDirection,
		hasHoveredShape: hoverState.shapeIndex !== INVALID_INDEX,
		rotation
	});

	onCursorUpdate(cursor);
}

/**
 * Handles camera panning
 */
export function handlePanning(event: MouseEvent, context: EventHandlerContext): void {
	const { x: currentMouseX, y: currentMouseY } = getMousePosition(event, context.canvas);
	const deltaX = currentMouseX - context.mouseState.lastMouseX;
	const deltaY = currentMouseY - context.mouseState.lastMouseY;

	context.mouseState.lastMouseX = currentMouseX;
	context.mouseState.lastMouseY = currentMouseY;

	context.onPanning(deltaX, deltaY);
	updateCursor(context);
	context.onScheduleDraw();
}

/**
 * Handles mouse wheel zoom
 */
export function handleWheel(event: WheelEvent, context: EventHandlerContext): void {
	event.preventDefault();

	const { x: mouseX, y: mouseY } = getMousePosition(event, context.canvas);
	const zoomFactor = event.deltaY > 0 ? ZOOM_OUT_FACTOR : ZOOM_IN_FACTOR;
	const newZoom = Math.max(
		MIN_CAMERA_ZOOM,
		Math.min(MAX_CAMERA_ZOOM, context.cameraState.zoom * zoomFactor)
	);

	// Zoom towards mouse position - adjust pan to keep the point under mouse fixed
	const zoomChange = newZoom / context.cameraState.zoom;
	context.cameraState.panX = mouseX - (mouseX - context.cameraState.panX) * zoomChange;
	context.cameraState.panY = mouseY - (mouseY - context.cameraState.panY) * zoomChange;
	context.cameraState.zoom = newZoom;

	context.onScheduleDraw();
}

/**
 * Handles shape dragging
 */
export function handleShapeDragging(event: MouseEvent, context: EventHandlerContext): void {
	event.preventDefault();

	const { x: currentMouseX, y: currentMouseY } = getMousePosition(event, context.canvas);
	const currentWorldPos = screenToWorld(currentMouseX, currentMouseY, context.cameraState);
	const lastWorldPos = screenToWorld(context.mouseState.lastMouseX, context.mouseState.lastMouseY, context.cameraState);

	const deltaX = currentWorldPos.x - lastWorldPos.x;
	const deltaY = currentWorldPos.y - lastWorldPos.y;

	context.mouseState.lastMouseX = currentMouseX;
	context.mouseState.lastMouseY = currentMouseY;

	// Use selected shape index if hover state is invalid (when dragging selected shape)
	const shapeIndexToDrag = context.isValidShapeIndex(context.hoverState.shapeIndex)
		? context.hoverState.shapeIndex
		: context.selectedShape.index;

	if (context.isValidShapeIndex(shapeIndexToDrag)) {
		context.onShapeDrag(shapeIndexToDrag, deltaX, deltaY);
	}

	updateCursor(context);
	context.onScheduleDraw();
}

/**
 * Handles shape rotation
 */
export function handleShapeRotation(event: MouseEvent, context: EventHandlerContext): void {
	if (!context.rotationStartState || !context.isValidShapeIndex(context.selectedShape.index)) {
		if (!context.isValidShapeIndex(context.selectedShape.index)) {
			context.onRotationStartStateChange(null);
		}
		return;
	}

	event.preventDefault();

	const { x: currentMouseX, y: currentMouseY } = getMousePosition(event, context.canvas);
	const currentWorldPos = screenToWorld(currentMouseX, currentMouseY, context.cameraState);

	const shape = context.shapes[context.selectedShape.index];
	if (!shape) {
		context.onRotationStartStateChange(null);
		return;
	}

	const shapeCenter = getShapeCenter(shape);
	const rotation = calculateRotation(context.rotationStartState, currentWorldPos, shapeCenter);

	context.mouseState.lastMouseX = currentMouseX;
	context.mouseState.lastMouseY = currentMouseY;

	context.onShapeRotate(context.selectedShape.index, rotation);
	context.onScheduleDraw();
}

/**
 * Handles shape resizing
 */
export function handleShapeResizing(event: MouseEvent, context: EventHandlerContext): void {
	if (!context.resizeStartState || !context.resizingCorner || !context.isValidShapeIndex(context.selectedShape.index)) {
		return;
	}

	event.preventDefault();

	const { x: currentMouseX, y: currentMouseY } = getMousePosition(event, context.canvas);
	const currentWorldPos = screenToWorld(currentMouseX, currentMouseY, context.cameraState);
	const shape = context.shapes[context.selectedShape.index];
	const rotation = shape.rotate ?? null;

	const { x, y, width, height } = calculateResize(
		context.resizeStartState,
		context.resizingCorner,
		currentWorldPos,
		rotation
	);

	context.mouseState.lastMouseX = currentMouseX;
	context.mouseState.lastMouseY = currentMouseY;

	context.onShapeResize(context.selectedShape.index, x, y, width, height);
	context.onScheduleDraw();
}

/**
 * Handles hover detection with throttling
 */
export function handleHoverDetection(
	event: MouseEvent,
	context: EventHandlerContext,
	hoverCheckTimeout: { value: number | null }
): void {
	if (hoverCheckTimeout.value !== null) {
		return; // Skip if already scheduled
	}

	hoverCheckTimeout.value = window.setTimeout(() => {
		hoverCheckTimeout.value = null;

		if (!context.editor) return;

		const { x, y } = getMousePosition(event, context.editor);
		const worldPos = screenToWorld(x, y, context.cameraState);

		const newHoverState = detectHover(
			worldPos,
			context.shapes,
			context.selectedShape.index,
			context.cameraState.zoom,
			context.isValidShapeIndex
		);

		const needsUpdate = updateHoverState(context.hoverState, newHoverState);

		if (needsUpdate) {
			updateCursor(context);
			context.onScheduleDraw();
		}
	}, HOVER_CHECK_DELAY);
}

/**
 * Handles mouse move events
 */
export function handleMouseMove(
	event: MouseEvent,
	context: EventHandlerContext,
	hoverCheckTimeout: { value: number | null }
): void {
	// Handle camera panning
	if (context.cameraState.isPanning && context.mouseState.isMouseDown) {
		event.preventDefault();
		updateCursor(context);
		handlePanning(event, context);
		return;
	}

	// Handle shape rotation (highest priority)
	if (context.rotationStartState !== null && context.mouseState.isMouseDown) {
		handleShapeRotation(event, context);
		return;
	}

	// Handle shape resizing (priority over dragging)
	if (context.resizingCorner !== null && context.mouseState.isMouseDown) {
		handleShapeResizing(event, context);
		return;
	}

	// Handle shape dragging
	// Check if we're dragging a shape (either from hover state or selected shape)
	if (context.mouseState.isDragging) {
		const canDragHovered = context.isValidShapeIndex(context.hoverState.shapeIndex);
		const canDragSelected = context.isValidShapeIndex(context.selectedShape.index);

		if (canDragHovered || canDragSelected) {
			handleShapeDragging(event, context);
			return;
		}
	}

	// Handle hover detection
	handleHoverDetection(event, context, hoverCheckTimeout);
}

/**
 * Handles mouse down events
 */
export function handleMouseDown(event: MouseEvent, context: EventHandlerContext): void {
	event.preventDefault();
	const { x, y } = getMousePosition(event, context.canvas);

	if (context.cameraState.isPanning) {
		context.mouseState.isMouseDown = true;
		context.mouseState.lastMouseX = x;
		context.mouseState.lastMouseY = y;
		updateCursor(context);
		return;
	}

	// Check if clicking on rotate circle (highest priority)
	if (context.hoverState.isHoveringRotateCircle && context.isValidShapeIndex(context.selectedShape.index)) {
		const shape = context.shapes[context.selectedShape.index];
		const worldPos = screenToWorld(x, y, context.cameraState);
		const rotationState = initializeRotation(shape, worldPos);
		context.onRotationStartStateChange(rotationState);

		context.mouseState.isMouseDown = true;
		context.mouseState.lastMouseX = x;
		context.mouseState.lastMouseY = y;
		updateCursor(context);
		return;
	}

	// Check if clicking on a resize corner
	if (context.hoverState.resizeCorner !== null && context.isValidShapeIndex(context.selectedShape.index)) {
		const shape = context.shapes[context.selectedShape.index];
		const worldPos = screenToWorld(x, y, context.cameraState);

		context.onResizingCornerChange(context.hoverState.resizeCorner);
		const resizeState = initializeResize(shape, worldPos);
		context.onResizeStartStateChange(resizeState);

		context.mouseState.isMouseDown = true;
		context.mouseState.lastMouseX = x;
		context.mouseState.lastMouseY = y;
		updateCursor(context);
		return;
	}

	// Handle shape selection/dragging
	const worldPos = screenToWorld(x, y, context.cameraState);
	const clickedShapeIndex = findShapeAtPoint(worldPos, context.shapes);

	if (context.isValidShapeIndex(clickedShapeIndex)) {
		context.mouseState.isDragging = true;
		context.mouseState.isMouseDown = true;
		context.mouseState.lastMouseX = x;
		context.mouseState.lastMouseY = y;

		if (context.selectedShape.index !== INVALID_INDEX && context.selectedShape.index !== clickedShapeIndex) {
			resetHoverState(context.hoverState);
		}

		context.onSelectionChange(clickedShapeIndex);
	} else {
		context.onSelectionClear();
	}

	context.onScheduleDraw();

	// Check for double click
	const now = Date.now();
	if (context.mouseState.lastClickTime && now - context.mouseState.lastClickTime < 300) {
		if (context.isValidShapeIndex(clickedShapeIndex)) {
			context.onShapeDoubleClick(clickedShapeIndex, worldPos.x, worldPos.y);
		}
	}
	context.mouseState.lastClickTime = now;
}

/**
 * Handles mouse up events
 */
export function handleMouseUp(event: MouseEvent, context: EventHandlerContext): void {
	if (context.rotationStartState !== null) {
		context.onRotationStartStateChange(null);
	}

	if (context.mouseState.isMouseDown) {
		event.preventDefault();
		context.mouseState.isMouseDown = false;

		// Clear transformation state for any operation (drag, resize, or rotate)
		if (context.mouseState.isDragging ||
			context.resizingCorner !== null ||
			context.rotationStartState !== null) {
			context.onTransformEnd();
		}

		context.mouseState.isDragging = false;
		context.onResizingCornerChange(null);
		context.onResizeStartStateChange(null);
		updateCursor(context);
	}
}

/**
 * Handles mouse leave events
 */
export function handleMouseLeave(
	event: MouseEvent,
	context: EventHandlerContext,
	hoverCheckTimeout: { value: number | null }
): void {
	if (context.mouseState.isMouseDown) {
		context.mouseState.isMouseDown = false;
		context.mouseState.isDragging = false;
		context.onResizingCornerChange(null);
		context.onResizeStartStateChange(null);
		context.onRotationStartStateChange(null);
		updateCursor(context);
	}

	if (hoverCheckTimeout.value !== null) {
		clearTimeout(hoverCheckTimeout.value);
		hoverCheckTimeout.value = null;
	}

	resetHoverState(context.hoverState);
	updateCursor(context);
	context.onScheduleDraw();
}

/**
 * Handles key down events
 */
export function handleKeyDown(event: KeyboardEvent, context: EventHandlerContext): void {
	if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
		return;
	}

	// Handle Delete or Backspace
	if (event.code === 'Delete' || event.key === 'Delete' || event.code === 'Backspace' || event.key === 'Backspace') {
		// Don't delete shape if we're editing text
		if (context.isTextEditing()) {
			return; // Let the text editor handle it
		}
		event.preventDefault();
		context.onDelete();
		return;
	}

	// Handle Undo (Ctrl+Z or Cmd+Z)
	if ((event.ctrlKey || event.metaKey) && (event.code === 'KeyZ' || event.key === 'z')) {
		event.preventDefault();
		context.onUndo();
		return;
	}

	// Handle Copy (Ctrl+C or Cmd+C)
	if ((event.ctrlKey || event.metaKey) && (event.code === 'KeyC' || event.key === 'c')) {
		event.preventDefault();
		context.onCopy();
		return;
	}

	// Handle Paste (Ctrl+V or Cmd+V)
	if ((event.ctrlKey || event.metaKey) && (event.code === 'KeyV' || event.key === 'v')) {
		event.preventDefault();
		context.onPaste();
		return;
	}

	if ((event.code === 'Space' || event.key === ' ') && !context.cameraState.isPanning) {
		event.preventDefault();
		context.cameraState.isPanning = true;
		updateCursor(context);
	}

	if (event.code === 'Escape' || event.key === 'Escape') {
		// Stop text editing if active
		if (context.isTextEditing()) {
			context.onStopTextEditing();
		} else {
			context.onSelectionClear();
		}
	}
}

/**
 * Handles key up events
 */
export function handleKeyUp(event: KeyboardEvent, context: EventHandlerContext): void {
	if (event.code === 'Space' || event.key === ' ') {
		event.preventDefault();
		context.cameraState.isPanning = false;
		updateCursor(context);
	}
}


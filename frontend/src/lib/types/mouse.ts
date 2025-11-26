export interface MouseState {
	isMouseDown: boolean;
	isDragging: boolean;
	lastMouseX: number;
	lastMouseY: number;
	lastClickTime?: number;
}
import type { CameraState } from '$lib/types/camera';

export interface Viewport {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/**
 * Calculates the visible viewport in world coordinates
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @param cameraState - Current camera state
 * @returns Viewport bounds in world coordinates
 */
export const calculateViewport = (
	canvasWidth: number,
	canvasHeight: number,
	cameraState: CameraState
): Viewport => {
	return {
		left: (-cameraState.panX) / cameraState.zoom,
		right: (canvasWidth - cameraState.panX) / cameraState.zoom,
		top: (-cameraState.panY) / cameraState.zoom,
		bottom: (canvasHeight - cameraState.panY) / cameraState.zoom
	};
};

/**
 * Checks if a rectangle is visible in the viewport
 * @param x - Rectangle X position
 * @param y - Rectangle Y position
 * @param width - Rectangle width
 * @param height - Rectangle height
 * @param viewport - Viewport bounds
 * @returns True if rectangle is visible
 */
export const isRectVisible = (
	x: number,
	y: number,
	width: number,
	height: number,
	viewport: Viewport
): boolean => {
	const right = x + width;
	const bottom = y + height;
	
	return !(
		right < viewport.left ||
		x > viewport.right ||
		bottom < viewport.top ||
		y > viewport.bottom
	);
};


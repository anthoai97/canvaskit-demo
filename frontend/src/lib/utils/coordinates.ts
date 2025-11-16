import type { CameraState } from '$lib/types/camera';
import type { Point } from './transform';

/**
 * Converts screen coordinates to world coordinates
 * @param screenX - X coordinate in screen space
 * @param screenY - Y coordinate in screen space
 * @param cameraState - Current camera state (pan and zoom)
 * @returns World coordinates
 */
export const screenToWorld = (
	screenX: number,
	screenY: number,
	cameraState: CameraState
): Point => {
	const worldX = (screenX - cameraState.panX) / cameraState.zoom;
	const worldY = (screenY - cameraState.panY) / cameraState.zoom;
	return { x: worldX, y: worldY };
};

/**
 * Converts world coordinates to screen coordinates
 * @param worldX - X coordinate in world space
 * @param worldY - Y coordinate in world space
 * @param cameraState - Current camera state (pan and zoom)
 * @returns Screen coordinates
 */
export const worldToScreen = (
	worldX: number,
	worldY: number,
	cameraState: CameraState
): Point => {
	const screenX = worldX * cameraState.zoom + cameraState.panX;
	const screenY = worldY * cameraState.zoom + cameraState.panY;
	return { x: screenX, y: screenY };
};

/**
 * Gets mouse position relative to an element
 * @param event - Mouse event
 * @param element - Element to get position relative to
 * @returns Mouse position relative to element
 */
export const getMousePosition = (event: MouseEvent, element: HTMLElement): Point => {
	const rect = element.getBoundingClientRect();
	return {
		x: event.clientX - rect.left,
		y: event.clientY - rect.top
	};
};


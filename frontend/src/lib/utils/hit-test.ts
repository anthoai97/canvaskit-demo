import type { Point } from './transform';

/**
 * Checks if a point is inside a rectangle
 * @param point - Point coordinates
 * @param x - Rectangle X position
 * @param y - Rectangle Y position
 * @param width - Rectangle width
 * @param height - Rectangle height
 * @returns True if point is inside rectangle
 */
export const isPointInRect = (
	point: Point,
	x: number,
	y: number,
	width: number,
	height: number
): boolean => {
	return (
		point.x >= x &&
		point.x <= x + width &&
		point.y >= y &&
		point.y <= y + height
	);
};

/**
 * Checks if a point is inside a circle
 * @param point - Point coordinates
 * @param centerX - Circle center X position
 * @param centerY - Circle center Y position
 * @param radius - Circle radius
 * @returns True if point is inside circle
 */
export const isPointInCircle = (
	point: Point,
	centerX: number,
	centerY: number,
	radius: number
): boolean => {
	const dx = point.x - centerX;
	const dy = point.y - centerY;
	const distanceSquared = dx * dx + dy * dy;
	return distanceSquared <= radius * radius;
};

/**
 * Finds the topmost shape at a given point
 * @param point - Point coordinates in world space
 * @param shapes - Array of shapes to check
 * @returns Index of the shape at the point, or -1 if none
 */
export const findShapeAtPoint = <T extends { x: number; y: number; width: number; height: number }>(
	point: Point,
	shapes: T[]
): number => {
	// Check in reverse order for top-most first
	for (let i = shapes.length - 1; i >= 0; i--) {
		const shape = shapes[i];
		if (isPointInRect(point, shape.x, shape.y, shape.width, shape.height)) {
			return i;
		}
	}
	return -1;
};


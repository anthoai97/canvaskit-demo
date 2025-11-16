import type { Shape } from '$lib/types/shape';

export interface Point {
	x: number;
	y: number;
}

/**
 * Converts degrees to radians
 */
export const degToRad = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Converts radians to degrees
 */
export const radToDeg = (radians: number): number => (radians * 180) / Math.PI;

/**
 * Gets the center point of a shape
 */
export const getShapeCenter = (shape: Shape): Point => ({
	x: shape.x + shape.width / 2,
	y: shape.y + shape.height / 2
});

/**
 * Applies rotation transformation to a point around a center
 * @param point - Point to rotate
 * @param center - Rotation center
 * @param rotationDeg - Rotation in degrees (positive = counterclockwise)
 * @returns Rotated point
 */
export const rotatePoint = (point: Point, center: Point, rotationDeg: number): Point => {
	if (rotationDeg === 0) return point;

	const dx = point.x - center.x;
	const dy = point.y - center.y;

	const rotationRad = degToRad(rotationDeg);
	const cos = Math.cos(rotationRad);
	const sin = Math.sin(rotationRad);

	const rotatedX = dx * cos - dy * sin;
	const rotatedY = dx * sin + dy * cos;

	return {
		x: rotatedX + center.x,
		y: rotatedY + center.y
	};
};

/**
 * Applies inverse rotation transformation to a point around a center
 * (Transforms from rotated space to unrotated space)
 * @param point - Point in rotated space
 * @param center - Rotation center
 * @param rotationDeg - Rotation in degrees
 * @returns Point in unrotated space
 */
export const inverseRotatePoint = (point: Point, center: Point, rotationDeg: number): Point => {
	return rotatePoint(point, center, -rotationDeg);
};

/**
 * Transforms a point from world space to shape's local coordinate space (unrotated)
 * @param point - Point in world space
 * @param shape - The shape
 * @param rotation - Rotation in degrees (null or 0 means no rotation)
 * @returns Point in local coordinate space
 */
export const worldToLocalSpace = (
	point: Point,
	shape: Shape,
	rotation: number | null = null
): Point => {
	if (rotation === null || rotation === 0) {
		return point;
	}

	const center = getShapeCenter(shape);
	return inverseRotatePoint(point, center, rotation);
};

/**
 * Transforms a point from local coordinate space to world space (with rotation)
 * @param point - Point in local space
 * @param shape - The shape
 * @param rotation - Rotation in degrees (null or 0 means no rotation)
 * @returns Point in world space
 */
export const localToWorldSpace = (
	point: Point,
	shape: Shape,
	rotation: number | null = null
): Point => {
	if (rotation === null || rotation === 0) {
		return point;
	}

	const center = getShapeCenter(shape);
	return rotatePoint(point, center, rotation);
};

/**
 * Calculates the angle in degrees from a point to a center
 * @param point - The point
 * @param center - The center point
 * @returns Angle in degrees (0-360, where 0 is right, 90 is down)
 */
export const getAngleToPoint = (point: Point, center: Point): number => {
	const dx = point.x - center.x;
	const dy = point.y - center.y;
	const angle = radToDeg(Math.atan2(dy, dx));
	// Normalize to 0-360
	return angle < 0 ? angle + 360 : angle;
};

/**
 * Calculates rotation delta from initial angle to current angle
 * @param initialAngle - Initial angle in degrees
 * @param currentAngle - Current angle in degrees
 * @returns Rotation delta in degrees
 */
export const calculateRotationDelta = (initialAngle: number, currentAngle: number): number => {
	let delta = currentAngle - initialAngle;
	
	// Handle wrap-around (e.g., going from 350° to 10°)
	if (delta > 180) {
		delta -= 360;
	} else if (delta < -180) {
		delta += 360;
	}
	
	return delta;
};


import type { CanvasKit, Canvas, Paint, FontMgr } from 'canvaskit-wasm';
import type { EditorPage } from '$lib/types/page';
import type { Shape, ImageShape, TextShape, ShapeAnimation } from '$lib/types/shape';
import { drawImageShape } from './image';
import { drawTextShape } from './text';

const DEFAULT_ANIMATION_DURATION = 300; // ms

/**
 * Animation state for a shape during rendering
 */
export interface AnimationState {
	shouldDraw: boolean;
	alpha: number;
	clipRect: Float32Array | null;
	offsetX: number;
	offsetY: number;
	progress: number;
	isAnimating: boolean;
}

/**
 * Generic shape type that supports animation
 */
type AnimatedShape = {
	animation?: ShapeAnimation;
	animationStart?: number | null;
	x: number;
	y: number;
	width: number;
	height: number;
	image?: any; // Optional for ImageShape
};

/**
 * Calculates animation state for a shape at the current time
 * Works for both ImageShape and TextShape
 */
export const calculateAnimationState = (
	ck: CanvasKit,
	shape: AnimatedShape,
	now: number,
	forceFinalState: boolean = false
): AnimationState => {
	const animation = shape.animation || { type: 'none' };
	const animType = animation.type;
	const animDuration = animation.duration ?? DEFAULT_ANIMATION_DURATION;
	const animDelay = animation.delay ?? 0;

	// If forced to final state, return the completed animation state
	if (forceFinalState) {
		return {
			shouldDraw: true,
			alpha: 1.0,
			clipRect: null,
			offsetX: 0,
			offsetY: 0,
			progress: 1.0,
			isAnimating: false
		};
	}

	// Initialize animation start time if needed
	if (animType !== 'none' && shape.animationStart == null) {
		shape.animationStart = now;
	}

	let shouldDraw = true;
	let alpha = 1.0;
	let clipRect: Float32Array | null = null;
	let offsetX = 0;
	let offsetY = 0;
	let isAnimating = false;

	if (animType !== 'none' && shape.animationStart != null) {
		const elapsed = now - shape.animationStart;
		
		// If still in delay period, return initial animation state
		if (elapsed < animDelay) {
			// During delay, shape should be in initial state
			if (animType === 'fade') {
				alpha = 0;
				shouldDraw = false;
			} else if (animType === 'wipe') {
				shouldDraw = false;
			} else if (animType === 'raise') {
				offsetY = shape.height; // Start below
			} else if (animType === 'pan') {
				const direction = animation.direction || 'left';
				offsetX = direction === 'left' ? -shape.width : shape.width; // Start off-screen
			}
			isAnimating = true; // Still animating (waiting for delay)
			
			return {
				shouldDraw,
				alpha,
				clipRect,
				offsetX,
				offsetY,
				progress: 0,
				isAnimating
			};
		}
		
		// Calculate progress after delay
		const animationElapsed = elapsed - animDelay;
		const progress = Math.max(0, Math.min(1, animationElapsed / animDuration));

		// Animation is still active if progress < 1 (even if delay is over)
		if (progress < 1) {
			isAnimating = true;
		}

		// Easing function for smooth animations (ease-out)
		const easedProgress = 1 - Math.pow(1 - progress, 3);

		if (animType === 'fade') {
			alpha = progress;
		} else if (animType === 'wipe') {
			// Wipe: vertically reveal from top to bottom
			const dstHeight = shape.height * progress;

			if (dstHeight > 0) {
				clipRect = ck.XYWHRect(
					shape.x,
					shape.y,
					shape.width,
					dstHeight
				);
			} else {
				shouldDraw = false;
			}
		} else if (animType === 'raise') {
			// Raise: slide up from below
			// Start 100% below, end at final position
			offsetY = shape.height * (1 - easedProgress);
		} else if (animType === 'pan') {
			// Pan: slide in horizontally
			const direction = animation.direction || 'left';
			if (direction === 'left') {
				// Slide in from left (start off-screen left, move to final position)
				offsetX = -shape.width * (1 - easedProgress);
			} else {
				// Slide in from right (start off-screen right, move to final position)
				offsetX = shape.width * (1 - easedProgress);
			}
		}

		return {
			shouldDraw,
			alpha,
			clipRect,
			offsetX,
			offsetY,
			progress,
			isAnimating
		};
	}

	return {
		shouldDraw,
		alpha,
		clipRect,
		offsetX: 0,
		offsetY: 0,
		progress: 1.0,
		isAnimating: false
	};
};

/**
 * Draws an image shape with animation support
 */
export const drawAnimatedImageShape = (
	ck: CanvasKit,
	canvas: Canvas,
	shape: ImageShape,
	paint: Paint,
	now: number,
	forceFinalState: boolean = false
): boolean => {
	if (!shape.image) return false;

	const animState = calculateAnimationState(ck, shape, now, forceFinalState);

	if (!animState.shouldDraw) {
		return animState.isAnimating;
	}

	// Apply clipping for wipe animation
	if (animState.clipRect) {
		canvas.save();
		canvas.clipRect(animState.clipRect, ck.ClipOp.Intersect, true);
	}

	// Apply alpha for fade animation
	if (animState.alpha < 1) {
		paint.setAlphaf(animState.alpha);
	}

	// Apply position offset for raise/pan animations
	if (animState.offsetX !== 0 || animState.offsetY !== 0) {
		canvas.save();
		canvas.translate(animState.offsetX, animState.offsetY);
	}

	// Draw the image (clipping will handle wipe animation)
	drawImageShape(ck, canvas, shape, paint);

	// Restore position offset
	if (animState.offsetX !== 0 || animState.offsetY !== 0) {
		canvas.restore();
	}

	// Restore paint alpha
	if (animState.alpha < 1) {
		paint.setAlphaf(1.0);
	}

	// Restore clipping
	if (animState.clipRect) {
		canvas.restore();
	}

	return animState.isAnimating;
};

/**
 * Draws a text shape with animation support
 */
export const drawAnimatedTextShape = (
	ck: CanvasKit,
	canvas: Canvas,
	fontMgr: FontMgr,
	shape: TextShape,
	now: number,
	forceFinalState: boolean = false
): boolean => {
	const animState = calculateAnimationState(ck, shape, now, forceFinalState);

	if (!animState.shouldDraw) {
		return animState.isAnimating;
	}

	// Apply clipping for wipe animation
	if (animState.clipRect) {
		canvas.save();
		canvas.clipRect(animState.clipRect, ck.ClipOp.Intersect, true);
	}

	// Apply position offset for raise/pan animations
	if (animState.offsetX !== 0 || animState.offsetY !== 0) {
		canvas.save();
		canvas.translate(animState.offsetX, animState.offsetY);
	}

	// For fade animation, adjust the shape's fontOpacity temporarily
	const originalOpacity = shape.fontOpacity;
	if (animState.alpha < 1) {
		shape.fontOpacity = originalOpacity * animState.alpha;
	}

	// Draw the text (will be clipped if wipe animation is active)
	drawTextShape(ck, canvas, fontMgr, shape);

	// Restore font opacity
	if (animState.alpha < 1) {
		shape.fontOpacity = originalOpacity;
	}

	// Restore position offset
	if (animState.offsetX !== 0 || animState.offsetY !== 0) {
		canvas.restore();
	}

	// Restore clipping
	if (animState.clipRect) {
		canvas.restore();
	}

	return animState.isAnimating;
};

/**
 * Calculates the maximum animation duration for a page
 */
export const getPageMaxAnimationDuration = (page: EditorPage): number => {
	let maxDuration = 0;
	for (const shape of page.shapes) {
		if (shape.animation && shape.animation.type !== 'none') {
			const duration = shape.animation.duration ?? DEFAULT_ANIMATION_DURATION;
			const delay = shape.animation.delay ?? 0;
			const total = duration + delay;
			if (total > maxDuration) {
				maxDuration = total;
			}
		}
	}
	return maxDuration;
};

/**
 * Starts animations for shapes
 */
export const startShapeAnimations = (
	shapesToAnimate: Shape[],
	startTime: number = performance.now()
) => {
	for (const shape of shapesToAnimate) {
		if (shape.animation && shape.animation.type !== 'none') {
			shape.animationStart = startTime;
		}
	}
};

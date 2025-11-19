import type { Canvas, CanvasKit, Paint, Surface, FontMgr } from 'canvaskit-wasm';
import type { EditorPage } from '$lib/types/page';
import type { Shape } from '$lib/types/shape';
import type { CameraState } from '$lib/types/camera';
import type { SelectedShape } from '$lib/types/editor';
import type { HoverState } from '$lib/utils/hover-state';
import { drawBackground } from '$lib/canvakit/drawing';
import { drawAnimatedImageShape, drawAnimatedTextShape } from '$lib/canvakit/animation';
import { getShapeCenter } from '$lib/utils/transform';
import { calculateViewport, isRectVisible } from '$lib/utils/viewport';
import { drawHoverBorder, drawSelectedBorder } from '$lib/canvakit/drawing';
import { INVALID_INDEX } from '$lib/contants/const';

export interface RenderContext {
	skCanvas: Canvas;
	ck: CanvasKit;
	paints: {
		background: Paint;
		image: Paint;
		hover: Paint;
		tool: Paint;
	};
	lowOpacityPaint: Paint;
	pageBounds: Float32Array;
	fontMgr: FontMgr;
	page: EditorPage;
	shapes: Shape[];
	selectedShape: SelectedShape;
	hoverState: HoverState;
	cameraState: CameraState;
	canvasWidth: number;
	canvasHeight: number;
	devicePixelRatio: number;
	surface: Surface | null;
	isValidShapeIndex: (index: number) => boolean;
}

/**
 * Draws the selected shape preview (full image at low opacity, outside page bounds)
 */
export function drawSelectedShapePreview(context: RenderContext): void {
	const { skCanvas, ck, lowOpacityPaint, shapes, selectedShape, isValidShapeIndex } = context;

	const selectedIndex = selectedShape.index;
	if (!isValidShapeIndex(selectedIndex)) return;

	const shape = shapes[selectedIndex];
	if (shape.kind !== 'image' || !shape.image) return;

	let center: { x: number; y: number } | null = null;
	if (shape.rotate !== null && shape.rotate !== 0) {
		center = getShapeCenter(shape);
	}

	skCanvas.save();
	if (center) {
		skCanvas.rotate(shape.rotate!, center.x, center.y);
	}

	const src = ck.XYWHRect(0, 0, shape.image.width(), shape.image.height());
	const dst = ck.XYWHRect(shape.x, shape.y, shape.width, shape.height);
	skCanvas.drawImageRect(shape.image, src, dst, lowOpacityPaint);

	skCanvas.restore();
}

/**
 * Draws all shapes (images and text) within the page clip.
 * Returns true if any shapes are still animating
 */
export function drawAllShapes(
	context: RenderContext,
	viewport: ReturnType<typeof calculateViewport>,
	now: number,
	onScheduleDraw: () => void
): boolean {
	const { skCanvas, ck, paints, pageBounds, fontMgr, shapes } = context;

	if (!skCanvas || !ck || !paints || !pageBounds || !fontMgr) return false;

	// Clip to page bounds
	skCanvas.save();
	skCanvas.clipRect(pageBounds, ck.ClipOp.Intersect, true);

	let hasAnimatingShapes = false;

	for (let i = 0; i < shapes.length; i++) {
		const shape = shapes[i];

		// Viewport culling - skip if shape is completely outside viewport
		if (!isRectVisible(shape.x, shape.y, shape.width, shape.height, viewport)) {
			continue;
		}

		// Images
		if (shape.kind === 'image') {
			if (!shape.image) continue;

			skCanvas.save();
			if (shape.rotate !== null && shape.rotate !== 0) {
				const center = getShapeCenter(shape);
				skCanvas.rotate(shape.rotate, center.x, center.y);
			}

			const isAnimating = drawAnimatedImageShape(ck, skCanvas, shape, paints.image, now);
			if (isAnimating) {
				hasAnimatingShapes = true;
			}

			skCanvas.restore();
		}

		// Text
		if (shape.kind === 'text') {
			skCanvas.save();
			if (shape.rotate !== null && shape.rotate !== 0) {
				const center = getShapeCenter(shape);
				skCanvas.rotate(shape.rotate, center.x, center.y);
			}

			const isAnimating = drawAnimatedTextShape(ck, skCanvas, fontMgr, shape, now);
			if (isAnimating) {
				hasAnimatingShapes = true;
			}

			skCanvas.restore();
		}
	}

	// Restore clipping so borders can extend beyond page bounds if needed
	skCanvas.restore();

	// If any shape is still animating, schedule another frame
	if (hasAnimatingShapes) {
		onScheduleDraw();
	}

	return hasAnimatingShapes;
}

/**
 * Draws hover and selection borders on top of all shapes
 */
export function drawShapeOverlays(context: RenderContext): void {
	const { skCanvas, ck, paints, shapes, hoverState, selectedShape, cameraState, isValidShapeIndex } =
		context;

	if (!skCanvas || !ck || !paints) return;

	// Hover border (when not selected)
	if (isValidShapeIndex(hoverState.shapeIndex) && hoverState.shapeIndex !== selectedShape.index) {
		const hoveredShape = shapes[hoverState.shapeIndex];

		skCanvas.save();
		if (hoveredShape.rotate !== null && hoveredShape.rotate !== 0) {
			const center = getShapeCenter(hoveredShape);
			skCanvas.rotate(hoveredShape.rotate, center.x, center.y);
		}

		drawHoverBorder(
			skCanvas,
			ck,
			hoveredShape.x,
			hoveredShape.y,
			hoveredShape.width,
			hoveredShape.height,
			paints.hover,
			cameraState.zoom
		);

		skCanvas.restore();
	}

	// Selected border
	const selectedIndex = selectedShape.index;
	if (!isValidShapeIndex(selectedIndex) || selectedShape.rendered === true) return;

	const shape = shapes[selectedIndex];
	let center: { x: number; y: number } | null = null;

	if (shape.rotate !== null && shape.rotate !== 0) {
		center = getShapeCenter(shape);
	}

	skCanvas.save();
	if (center) {
		skCanvas.rotate(shape.rotate!, center.x, center.y);
	}

	drawSelectedBorder(
		skCanvas,
		ck,
		shape.x,
		shape.y,
		shape.width,
		shape.height,
		paints.tool,
		cameraState.zoom
	);

	skCanvas.restore();
}

/**
 * Main scene drawing function
 */
export function drawScene(context: RenderContext, onScheduleDraw: () => void): boolean {
	const {
		skCanvas,
		ck,
		paints,
		lowOpacityPaint,
		pageBounds,
		fontMgr,
		canvasWidth,
		canvasHeight,
		devicePixelRatio,
		cameraState,
		surface
	} = context;

	if (!skCanvas || !ck || !paints || !lowOpacityPaint || !pageBounds || !fontMgr) return false;

	skCanvas.clear(ck.Color(0, 0, 0, 1.0));
	skCanvas.save();

	// First scale by devicePixelRatio so all world/screen math can stay in CSS pixels
	skCanvas.scale(devicePixelRatio, devicePixelRatio);

	// Then apply camera pan/zoom in logical (CSS) pixels
	skCanvas.translate(cameraState.panX, cameraState.panY);
	skCanvas.scale(cameraState.zoom, cameraState.zoom);

	// Calculate visible viewport for culling
	const viewport = calculateViewport(canvasWidth, canvasHeight, cameraState);
	const now = performance.now();

	// Draw background
	drawBackground(skCanvas, ck, context.page, paints.background);

	// Draw selected shape preview (full image with low opacity)
	drawSelectedShapePreview(context);

	// Draw all shapes inside page bounds and check if animations are still running
	const isAnimating = drawAllShapes(context, viewport, now, onScheduleDraw);

	// Draw hover + selection borders on top
	drawShapeOverlays(context);

	skCanvas.restore();
	surface?.flush();

	return isAnimating;
}


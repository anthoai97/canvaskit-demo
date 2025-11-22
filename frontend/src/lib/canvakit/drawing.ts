import type { CanvasKit, Canvas, Paint } from 'canvaskit-wasm';
import type { EditorPage } from '$lib/types/page';
import type { CameraState } from '$lib/types/camera';
import { rgbaToCanvasKitColor, type RGBA } from '$lib/types/color';
import { DEFAULT_HOVER_BORDER, DEFAULT_TOOL_BORDER } from '$lib/contants/const';

export interface PaintObjects {
	background: Paint;
	image: Paint;
	hover: Paint;
	tool: Paint;
}

/**
 * Initializes paint objects for drawing
 * @param ck - CanvasKit instance
 * @param page - Page configuration
 * @returns Paint objects
 */
export const createPaints = (ck: CanvasKit, page: EditorPage): PaintObjects => {
	const backgroundPaint = new ck.Paint();
	backgroundPaint.setColor(rgbaToCanvasKitColor(ck, page.background.color));

	const imagePaint = new ck.Paint();

	const hoverPaint = new ck.Paint();
	hoverPaint.setStyle(ck.PaintStyle.Stroke);
	hoverPaint.setStrokeWidth(DEFAULT_HOVER_BORDER.borderWidth);
	hoverPaint.setColor(rgbaToCanvasKitColor(ck, DEFAULT_HOVER_BORDER.color));

	const toolPaint = new ck.Paint();
	toolPaint.setStyle(ck.PaintStyle.Stroke);
	toolPaint.setStrokeWidth(DEFAULT_TOOL_BORDER.borderWidth);
	toolPaint.setColor(rgbaToCanvasKitColor(ck, DEFAULT_TOOL_BORDER.color));

	return {
		background: backgroundPaint,
		image: imagePaint,
		hover: hoverPaint,
		tool: toolPaint
	};
};

/**
 * Draws the page background
 * @param canvas - Canvas to draw on
 * @param ck - CanvasKit instance
 * @param page - Page configuration
 * @param paint - Background paint object
 */
export const drawBackground = (
	canvas: Canvas,
	ck: CanvasKit,
	page: EditorPage,
	paint: Paint
): void => {
	const bg_x = -page.width / 2;
	const bg_y = -page.height / 2;
	const bg_width = page.width;
	const bg_height = page.height;
	canvas.drawRect(ck.XYWHRect(bg_x, bg_y, bg_width, bg_height), paint);
};

/**
 * Draws a hover border around a shape
 * @param canvas - Canvas to draw on
 * @param ck - CanvasKit instance
 * @param x - Shape X position
 * @param y - Shape Y position
 * @param width - Shape width
 * @param height - Shape height
 * @param paint - Hover paint object
 * @param zoom - Current zoom level
 */
export const drawHoverBorder = (
	canvas: Canvas,
	ck: CanvasKit,
	x: number,
	y: number,
	width: number,
	height: number,
	paint: Paint,
	zoom: number
): void => {
	const borderWidth = DEFAULT_HOVER_BORDER.borderWidth * zoom < DEFAULT_HOVER_BORDER.minBorderWidth ? DEFAULT_HOVER_BORDER.minBorderWidth : DEFAULT_HOVER_BORDER.borderWidth * zoom;
	paint.setStrokeWidth(borderWidth);
	canvas.drawRect(ck.XYWHRect(x, y, width, height), paint);
};

export const drawSelectedBorder = (
	canvas: Canvas,
	ck: CanvasKit,
	x: number,
	y: number,
	width: number,
	height: number,
	paint: Paint,
	zoom: number
): void => {
	const borderWidth = DEFAULT_TOOL_BORDER.borderWidth * zoom < DEFAULT_TOOL_BORDER.minBorderWidth ? DEFAULT_TOOL_BORDER.minBorderWidth : DEFAULT_TOOL_BORDER.borderWidth * zoom;
	paint.setStrokeWidth(borderWidth);
	canvas.drawRect(ck.XYWHRect(x, y, width, height), paint);

	// Draw 4 resize circles at the corners
	let circleRadius = DEFAULT_TOOL_BORDER.circleRadius * zoom < DEFAULT_TOOL_BORDER.circleRadius ? DEFAULT_TOOL_BORDER.circleRadius : DEFAULT_TOOL_BORDER.circleRadius * zoom;
	const minCircleRadius = DEFAULT_TOOL_BORDER.minCircleRadius * zoom < DEFAULT_TOOL_BORDER.minCircleRadius ? DEFAULT_TOOL_BORDER.minCircleRadius : DEFAULT_TOOL_BORDER.minCircleRadius * zoom;
	if (circleRadius < minCircleRadius) {
		circleRadius = minCircleRadius;
	}

	// White fill paint for circle background
	const circleFillPaint = new ck.Paint();
	circleFillPaint.setStyle(ck.PaintStyle.Fill);
	circleFillPaint.setColor(rgbaToCanvasKitColor(ck, { r: 255, g: 255, b: 255, a: 1 }));

	// Colored stroke paint for circle border
	const circleStrokePaint = new ck.Paint();
	circleStrokePaint.setStyle(ck.PaintStyle.Stroke);
	circleStrokePaint.setColor(rgbaToCanvasKitColor(ck, DEFAULT_TOOL_BORDER.color));
	circleStrokePaint.setStrokeWidth(borderWidth);

	// Draw circles with white fill and colored stroke
	const corners = [
		{ x: x, y: y }, // Top-left
		{ x: x + width, y: y }, // Top-right
		{ x: x, y: y + height }, // Bottom-left
		{ x: x + width, y: y + height } // Bottom-right
	];

	// Adjust rotation handle position inversely with zoom
	const rotationCircle = {
		x: x + width / 2,
		y: y - (30 / zoom), // Move closer/further based on zoom to stay visually consistent
		radius: circleRadius
	};

	canvas.drawCircle(rotationCircle.x, rotationCircle.y, rotationCircle.radius, circleFillPaint);
	canvas.drawCircle(rotationCircle.x, rotationCircle.y, rotationCircle.radius, circleStrokePaint);

	for (const corner of corners) {
		// Draw white fill first
		canvas.drawCircle(corner.x, corner.y, circleRadius, circleFillPaint);
		// Draw colored stroke on top
		canvas.drawCircle(corner.x, corner.y, circleRadius, circleStrokePaint);
	}

	// Cleanup
	circleFillPaint.delete();
	circleStrokePaint.delete();
};
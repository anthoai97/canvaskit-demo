import type { Canvas, CanvasKit, Surface } from 'canvaskit-wasm';

export interface LoadingRenderContext {
	skCanvas: Canvas;
	ck: CanvasKit;
	canvasWidth: number;
	canvasHeight: number;
	devicePixelRatio: number;
	surface: Surface | null;
	progress?: number; // 0-1 for loading progress
}

/**
 * Draws a simple loading screen with a white spinning circle on black background
 */
export function drawLoadingScreen(context: LoadingRenderContext, time: number): void {
	const { skCanvas, ck, canvasWidth, canvasHeight, devicePixelRatio, surface } = context;

	// Clear canvas with black background
	skCanvas.clear(ck.Color(0, 0, 0, 1.0));

	skCanvas.save();

	// Scale by devicePixelRatio
	skCanvas.scale(devicePixelRatio, devicePixelRatio);

	// Draw white loading circle in center
	const centerX = canvasWidth / 2;
	const centerY = canvasHeight / 2;
	const circleRadius = 15;

	// White circle paint
	const circlePaint = new ck.Paint();
	circlePaint.setColor(ck.Color(255, 255, 255, 1.0));
	circlePaint.setStyle(ck.PaintStyle.Stroke);
	circlePaint.setStrokeWidth(4);
	circlePaint.setStrokeCap(ck.StrokeCap.Round);

	// Rotate the circle based on time
	const rotation = (time * 0.01) % (Math.PI * 2);
	skCanvas.save();
	skCanvas.translate(centerX, centerY);
	skCanvas.rotate((rotation * 180) / Math.PI, 0, 0);

	// Draw a partial circle (arc) that rotates
	// Create path with arc segments to form 3/4 of a circle
	const path = new ck.Path();
	const rect = ck.LTRBRect(-circleRadius, -circleRadius, circleRadius, circleRadius);
	
	// Draw arc segments to create a partial circle (270 degrees total)
	// Start at 0 degrees, draw 90 degree segments
	path.addArc(rect, 0, 90);
	path.addArc(rect, 90, 90);
	path.addArc(rect, 180, 90);
	
	skCanvas.drawPath(path, circlePaint);
	path.delete();

	skCanvas.restore();

	// Cleanup
	circlePaint.delete();

	skCanvas.restore();
	surface?.flush();
}


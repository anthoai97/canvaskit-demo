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
 * Draws a simple loading screen (black background)
 */
export function drawLoadingScreen(context: LoadingRenderContext, time: number): void {
	const { skCanvas, ck, surface } = context;

	// Clear canvas with black background
	skCanvas.clear(ck.Color(0, 0, 0, 1.0));

	surface?.flush();
}


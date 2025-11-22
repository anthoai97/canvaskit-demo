import CanvasKitInit from 'canvaskit-wasm';
import type { CanvasKit, Surface } from 'canvaskit-wasm';

/**
 * Initializes CanvasKit with default configuration
 * @returns Promise that resolves to a CanvasKit instance
 */
export const initCanvasKit = async (): Promise<CanvasKit> => {
	return await CanvasKitInit({
		locateFile: (file) => `node_modules/canvaskit-wasm/bin/${file}`
	});
};

/**
 * Creates a WebGL canvas surface from an HTML canvas element
 * @param ck - CanvasKit instance
 * @param canvas - HTML canvas element
 * @returns CanvasKit Surface or null if creation fails
 */
export const createWebGLSurface = (ck: CanvasKit, canvas: HTMLCanvasElement): Surface | null => {
	try {
		// Initialize context with preserveDrawingBuffer: true for partial redraw support
		const contextAttributes = {
			preserveDrawingBuffer: true,
			alpha: true,
			antialias: true,
			depth: true,
			stencil: true
		};
		// Initialize the context with our attributes before CanvasKit requests it
		canvas.getContext('webgl2', contextAttributes) || canvas.getContext('webgl', contextAttributes);

		return ck.MakeWebGLCanvasSurface(canvas);
	} catch (error) {
		console.error('Failed to create WebGL surface:', error);
		return null;
	}
};


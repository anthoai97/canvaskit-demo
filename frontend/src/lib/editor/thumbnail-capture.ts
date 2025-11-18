import type { CanvasKit, Canvas, FontMgr } from 'canvaskit-wasm';
import type { EditorPage } from '$lib/types/page';
import type { Shape } from '$lib/types/shape';
import type { PaintObjects } from '$lib/canvakit/drawing';
import { drawTextShape } from '$lib/canvakit/text';

/**
 * Configuration for thumbnail generation
 */
export interface ThumbnailConfig {
	width: number;
	quality: number;
}

/**
 * Default thumbnail configuration
 */
const DEFAULT_THUMBNAIL_CONFIG: ThumbnailConfig = {
	width: 600,
	quality: 80
};

/**
 * Context required for thumbnail generation
 */
export interface ThumbnailContext {
	ck: CanvasKit;
	page: EditorPage;
	pageBounds: Float32Array;
	shapes: Shape[];
	paints: PaintObjects;
	fontMgr: FontMgr;
	config?: Partial<ThumbnailConfig>;
}

/**
 * Calculates thumbnail dimensions maintaining page aspect ratio
 */
function calculateThumbnailDimensions(
	pageWidth: number,
	pageHeight: number,
	thumbnailWidth: number
): { width: number; height: number } {
	const width = thumbnailWidth;
	const height = Math.round((pageHeight / pageWidth) * width);
	return { width, height };
}

/**
 * Calculates scale and offset to fit page in thumbnail while maintaining aspect ratio
 */
function calculateThumbnailTransform(
	pageWidth: number,
	pageHeight: number,
	thumbnailWidth: number,
	thumbnailHeight: number
): { scale: number; offsetX: number; offsetY: number } {
	const scaleX = thumbnailWidth / pageWidth;
	const scaleY = thumbnailHeight / pageHeight;
	const scale = Math.min(scaleX, scaleY);
	const offsetX = (thumbnailWidth - pageWidth * scale) / 2;
	const offsetY = (thumbnailHeight - pageHeight * scale) / 2;
	return { scale, offsetX, offsetY };
}

/**
 * Applies transform to center and scale page content in thumbnail
 */
function applyThumbnailTransform(
	canvas: Canvas,
	pageWidth: number,
	pageHeight: number,
	scale: number,
	offsetX: number,
	offsetY: number
): void {
	canvas.translate(offsetX, offsetY);
	canvas.scale(scale, scale);
	canvas.translate(pageWidth / 2, pageHeight / 2); // Move origin to page center
}

/**
 * Draws a shape on the thumbnail canvas with rotation support
 */
function drawThumbnailShape(
	ck: CanvasKit,
	canvas: Canvas,
	shape: Shape,
	paints: PaintObjects,
	fontMgr: FontMgr
): void {
	canvas.save();

	// Apply rotation if needed
	if (shape.rotate !== null && shape.rotate !== 0) {
		const centerX = shape.x + shape.width / 2;
		const centerY = shape.y + shape.height / 2;
		canvas.rotate(shape.rotate, centerX, centerY);
	}

	// Draw image shape
	if (shape.kind === 'image' && shape.image) {
		const src = ck.XYWHRect(0, 0, shape.image.width(), shape.image.height());
		const dst = ck.XYWHRect(shape.x, shape.y, shape.width, shape.height);
		canvas.drawImageRect(shape.image, src, dst, paints.image);
	}

	// Draw text shape
	if (shape.kind === 'text') {
		drawTextShape(ck, canvas, fontMgr, shape);
	}

	canvas.restore();
}

/**
 * Renders page content to thumbnail canvas
 */
function renderThumbnailContent(
	ck: CanvasKit,
	canvas: Canvas,
	page: EditorPage,
	pageBounds: Float32Array,
	shapes: Shape[],
	paints: PaintObjects,
	fontMgr: FontMgr
): void {
	// Draw page background
	canvas.drawRect(pageBounds, paints.background);

	// Clip to page bounds and draw shapes
	canvas.save();
	canvas.clipRect(pageBounds, ck.ClipOp.Intersect, true);

	for (const shape of shapes) {
		if ((shape.kind === 'image' && shape.image) || shape.kind === 'text') {
			drawThumbnailShape(ck, canvas, shape, paints, fontMgr);
		}
	}

	canvas.restore();
}

/**
 * Converts blob to data URL
 */
function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			if (reader.result) {
				resolve(reader.result as string);
			} else {
				reject(new Error('Failed to read blob'));
			}
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

/**
 * Captures the current page render as a thumbnail data URL
 * @param context - Thumbnail generation context
 * @returns Promise that resolves to the data URL string, or null if capture fails
 */
export async function captureThumbnail(context: ThumbnailContext): Promise<string | null> {
	const { ck, page, pageBounds, shapes, paints, fontMgr, config = {} } = context;
	const thumbnailConfig = { ...DEFAULT_THUMBNAIL_CONFIG, ...config };

	// Calculate thumbnail dimensions
	const { width: thumbnailWidth, height: thumbnailHeight } = calculateThumbnailDimensions(
		page.width,
		page.height,
		thumbnailConfig.width
	);

	// Create temporary surface for thumbnail
	const tempSurface = ck.MakeSurface(thumbnailWidth, thumbnailHeight);
	if (!tempSurface) return null;

	const tempCanvas = tempSurface.getCanvas();

	try {
		// Initialize canvas
		tempCanvas.clear(ck.Color(255, 255, 255, 1.0));
		tempCanvas.save();

		// Calculate and apply transform
		const { scale, offsetX, offsetY } = calculateThumbnailTransform(
			page.width,
			page.height,
			thumbnailWidth,
			thumbnailHeight
		);

		applyThumbnailTransform(tempCanvas, page.width, page.height, scale, offsetX, offsetY);

		// Render page content
		renderThumbnailContent(ck, tempCanvas, page, pageBounds, shapes, paints, fontMgr);

		tempCanvas.restore();

		// Capture and encode thumbnail
		const thumbnailImage = tempSurface.makeImageSnapshot();
		tempSurface.delete();

		if (!thumbnailImage) return null;

		const data = thumbnailImage.encodeToBytes(ck.ImageFormat.PNG, thumbnailConfig.quality);
		thumbnailImage.delete();

		if (!data) return null;

		// Convert to data URL
		const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
		const dataUrl = await blobToDataUrl(blob);

		return dataUrl;
	} catch (error) {
		console.error('Error capturing thumbnail:', error);
		return null;
	}
}


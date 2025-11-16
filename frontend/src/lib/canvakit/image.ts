import type { Canvas, CanvasKit, Image, Paint } from 'canvaskit-wasm';
import type { ImageShape } from '$lib/types/shape';

/**
 * Loads an image from a URL using CanvasKit
 * @param ck - CanvasKit instance
 * @param url - Image URL to load
 * @returns Promise that resolves to a CanvasKit Image
 */
export const loadSkImage = async (ck: CanvasKit, url: string): Promise<Image | null> => {
	try {
		const buf = await fetch(url).then((r) => r.arrayBuffer());
		const img = ck.MakeImageFromEncoded(new Uint8Array(buf));
		return img;
	} catch (error) {
		console.error('Failed to load image:', url, error);
		return null;
	}
};

/**
 * Updates shapes sequentially by loading their images
 * @param ck - CanvasKit instance
 * @param data - Array of shapes to update
 * @returns Promise that resolves to updated shapes with loaded images
 */
export async function loadImageBinary<
	T extends {
		x: number;
		y: number;
		width: number;
		height: number;
		url: string;
		image: Image | null;
		ratio: number;
		rotate: number | null;
		kind?: string;
	}
>(
	ck: CanvasKit,
	data: T[]
): Promise<T[]> {
	const result: T[] = [];
	for (const shape of data) {
		if (shape.kind !== 'image') {
			result.push(shape);
			continue;
		}
		const image = await loadSkImage(ck, shape.url);
		const ratio = image ? image.width() / image.height() : 0;
		result.push({
			...shape,
			image: image,
			width: image?.width() ?? shape.width,
			height: image?.height() ?? shape.height,
			ratio: ratio
		});
	}
	return result;
}

/**
 * Draws a single image shape on the given canvas.
 * Rotation and clipping are expected to be handled by the caller.
 */
export const drawImageShape = (
	ck: CanvasKit,
	canvas: Canvas,
	shape: ImageShape,
	paint: Paint
): void => {
	if (!shape.image) return;

	const src = ck.XYWHRect(0, 0, shape.image.width(), shape.image.height());
	const dst = ck.XYWHRect(shape.x, shape.y, shape.width, shape.height);
	canvas.drawImageRect(shape.image, src, dst, paint);
};


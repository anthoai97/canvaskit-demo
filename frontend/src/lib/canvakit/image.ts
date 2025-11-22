import type { Canvas, CanvasKit, Image, Paint } from 'canvaskit-wasm';
import type { ImageShape } from '$lib/types/shape';

const imageCache = new Map<string, Promise<ArrayBuffer>>();

/**
 * Loads an image from a URL using CanvasKit
 * @param ck - CanvasKit instance
 * @param url - Image URL to load
 * @param blob - Optional Blob to load directly instead of fetching URL
 * @returns Promise that resolves to a CanvasKit Image
 */
export const loadSkImage = async (ck: CanvasKit, url: string, blob?: Blob): Promise<Image | null> => {
	try {
		let buf: ArrayBuffer;
		if (blob) {
			buf = await blob.arrayBuffer();
		} else {
			let promise = imageCache.get(url);
			if (!promise) {
				promise = fetch(url).then((r) => r.arrayBuffer());
				imageCache.set(url, promise);
				promise.catch(() => imageCache.delete(url));
			}
			buf = await promise;
		}
		
		// Create the image from encoded data
		const img = ck.MakeImageFromEncoded(new Uint8Array(buf));
		
		// Generate mipmaps for better downscaling performance and quality
		if (img) {
			const imgWithMips = img.makeCopyWithDefaultMipmaps();
			if (imgWithMips) {
				img.delete(); // Clean up the original non-mipmapped image
				return imgWithMips;
			}
			return img; // Fallback if mipmap generation fails
		}
		return null;
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
		blob?: Blob;
	}
>(
	ck: CanvasKit,
	data: T[]
): Promise<T[]> {
	// Load all images in parallel instead of sequentially
	const promises = data.map(async (shape) => {
		if (shape.kind !== 'image') {
			return shape;
		}
		const image = await loadSkImage(ck, shape.url, shape.blob);
		const ratio = image ? image.width() / image.height() : 0;

		// Preserve the logical width/height from the data file so layout size
		// is independent from the intrinsic pixel resolution of the image.
		// We only store the image handle and aspect ratio here.
		return {
			...shape,
			image,
			ratio
		};
	});

	return Promise.all(promises);
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
	
	// Use drawImageRectOptions for better quality downscaling (trilinear filtering)
	// This takes advantage of the mipmaps generated during loading
	if (canvas.drawImageRectOptions) {
		canvas.drawImageRectOptions(
			shape.image, 
			src, 
			dst, 
			ck.FilterMode.Linear, 
			ck.MipmapMode.Linear, 
			paint
		);
	} else {
		canvas.drawImageRect(shape.image, src, dst, paint);
	}
};


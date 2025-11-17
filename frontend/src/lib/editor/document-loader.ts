import type { CanvasKit } from 'canvaskit-wasm';
import type { EditorDocument, EditorPage } from '$lib/types/page';
import type { ImageShape, Shape } from '$lib/types/shape';
import { loadImageBinary } from '$lib/canvakit/image';

/**
 * Loads a document from various JSON formats
 */
export async function loadDocument(url: string): Promise<EditorDocument | null> {
	try {
		const response = await fetch(url);
		await new Promise(resolve => setTimeout(resolve, 3000));
		if (!response.ok) {
			console.error('Failed to fetch document', response.status);
			return null;
		}

		const json = await response.json();

		// Support multiple formats
		if (json.page) {
			// Old format: single page
			return {
				pages: [json.page]
			};
		} else if (json.pages && Array.isArray(json.pages)) {
			// New format: document with pages
			return json;
		} else if (Array.isArray(json) && json.length > 0) {
			// Alternative format: array with page objects
			return {
				id: 'doc-1',
				pages: json.map((item: any) => item.f || item.page).filter((p: any) => p)
			};
		}

		console.error('Unknown data format');
		return null;
	} catch (error) {
		console.error('Error fetching document', error);
		return null;
	}
}

/**
 * Creates a default empty document
 */
export function createDefaultDocument(): EditorDocument {
	return {
		id: 'doc-default',
		pages: [
			{
				id: 'page-1',
				width: 1920,
				height: 1080,
				background: {
					color: { r: 255, g: 255, b: 255, a: 1.0 }
				},
				shapes: []
			}
		]
	};
}

/**
 * Loads images for shapes in a page
 */
export async function loadPageImages(
	ck: CanvasKit,
	page: EditorPage
): Promise<Shape[]> {
	const pageShapes = page.shapes || [];
	return (await loadImageBinary(ck, pageShapes as ImageShape[])) as Shape[];
}


import type { CanvasKit, FontMgr } from 'canvaskit-wasm';
import type { EditorDocument, EditorPage } from '$lib/types/page';
import type { Shape } from '$lib/types/shape';
import { createPaints } from '$lib/canvakit/drawing';
import { captureThumbnail, type ThumbnailContext } from './thumbnail-capture';
import { loadPageImages } from './document-loader';

/**
 * Configuration for thumbnail capture delays
 */
const THUMBNAIL_CAPTURE_DELAYS = {
	INITIAL: 500, // Delay when no thumbnail exists
	UPDATE: 1000 // Delay when thumbnail exists (longer to ensure user completed action)
} as const;

/**
 * Configuration for background thumbnail processing
 */
const BACKGROUND_THUMBNAIL_CONFIG = {
	PAGE_DELAY: 150, // Delay between pages
	IDLE_CALLBACK_TIMEOUT: 2000, // Timeout for requestIdleCallback
	FALLBACK_DELAY: 300, // Fallback delay when requestIdleCallback not available
	START_DELAY: 2000, // Delay before starting background processing
	START_IDLE_TIMEOUT: 3000 // Timeout for starting background processing
} as const;

/**
 * Generates a hash of shapes state for change detection
 */
export function generateShapesHash(shapes: Shape[]): string {
	return JSON.stringify(
		shapes.map((s) => ({
			x: s.x,
			y: s.y,
			width: s.width,
			height: s.height,
			rotate: s.rotate,
			kind: s.kind,
			...(s.kind === 'image' ? { url: s.url } : {}),
			...(s.kind === 'text' ? { text: s.text, fontSize: s.fontSize } : {})
		}))
	);
}

/**
 * Captures thumbnail for a specific page
 */
export async function captureThumbnailForPage(
	ck: CanvasKit,
	fontMgr: FontMgr,
	targetPage: EditorPage,
	targetShapes: Shape[]
): Promise<string | null> {
	if (!ck || !fontMgr) {
		return null;
	}

	const targetPaints = createPaints(ck, targetPage);
	const targetPageBounds = ck.XYWHRect(
		-targetPage.width / 2,
		-targetPage.height / 2,
		targetPage.width,
		targetPage.height
	);

	return captureThumbnail({
		ck,
		page: targetPage,
		pageBounds: targetPageBounds,
		shapes: targetShapes,
		paints: targetPaints,
		fontMgr
	});
}

/**
 * Captures thumbnail for current page using provided context
 */
export async function captureThumbnailLocal(
	context: ThumbnailContext
): Promise<string | null> {
	const { ck, page, pageBounds, paints, fontMgr } = context;
	if (!ck || !page || !pageBounds || !paints || !fontMgr) {
		return null;
	}

	return captureThumbnail(context);
}

/**
 * Updates a page in the document with a new thumbnail
 */
export function updatePageThumbnail(
	document: EditorDocument,
	page: EditorPage,
	thumbnailUrl: string
): { document: EditorDocument; page: EditorPage } {
	const pageIndex = document.pages.findIndex((p) => p.id === page.id);
	if (pageIndex === -1) {
		return { document, page };
	}

	const updatedPage = { ...page, thumbnailUrl };
	const updatedPages = [...document.pages];
	updatedPages[pageIndex] = updatedPage;
	const updatedDocument = { ...document, pages: updatedPages };

	return { document: updatedDocument, page: updatedPage };
}

/**
 * Finds all pages that need thumbnails
 */
export function findPagesNeedingThumbnails(document: EditorDocument): number[] {
	const pagesNeedingThumbnails: number[] = [];
	for (let i = 0; i < document.pages.length; i++) {
		const p = document.pages[i];
		if (!p.thumbnailUrl && p.shapes.length > 0) {
			pagesNeedingThumbnails.push(i);
		}
	}
	return pagesNeedingThumbnails;
}

/**
 * Processes a single page thumbnail in the background
 */
export async function processPageThumbnail(
	ck: CanvasKit,
	fontMgr: FontMgr,
	document: EditorDocument,
	pageIndex: number
): Promise<EditorDocument | null> {
	if (!document || !ck || pageIndex < 0 || pageIndex >= document.pages.length) {
		return null;
	}

	const targetPage = document.pages[pageIndex];
	if (!targetPage || targetPage.thumbnailUrl) {
		return null; // Already has thumbnail
	}

	try {
		const loadedShapes = await loadPageImages(ck, targetPage);
		const dataUrl = await captureThumbnailForPage(ck, fontMgr, targetPage, loadedShapes);

		if (dataUrl && document) {
			const { document: updatedDocument } = updatePageThumbnail(document, targetPage, dataUrl);
			return updatedDocument;
		}
	} catch (error) {
		console.error(`Error capturing thumbnail for page ${pageIndex}:`, error);
	}

	return null;
}

/**
 * Processes background thumbnails for all pages
 */
export async function processBackgroundThumbnails(
	ck: CanvasKit,
	fontMgr: FontMgr,
	document: EditorDocument,
	onProgress?: (document: EditorDocument) => void
): Promise<EditorDocument> {
	const pagesNeedingThumbnails = findPagesNeedingThumbnails(document);
	console.log(`Found ${pagesNeedingThumbnails.length} pages needing thumbnails`);

	let currentDocument = document;

	// Process pages one at a time with delays to avoid blocking
	for (const pageIndex of pagesNeedingThumbnails) {
		await new Promise<void>((resolve) => {
			const processPage = async () => {
				const updatedDocument = await processPageThumbnail(ck, fontMgr, currentDocument, pageIndex);
				if (updatedDocument) {
					currentDocument = updatedDocument;
					if (onProgress) {
						onProgress(currentDocument);
					}
				}
				setTimeout(resolve, BACKGROUND_THUMBNAIL_CONFIG.PAGE_DELAY);
			};

			if ('requestIdleCallback' in window) {
				(window as any).requestIdleCallback(processPage, {
					timeout: BACKGROUND_THUMBNAIL_CONFIG.IDLE_CALLBACK_TIMEOUT
				});
			} else {
				setTimeout(processPage, BACKGROUND_THUMBNAIL_CONFIG.FALLBACK_DELAY);
			}
		});
	}

	return currentDocument;
}

/**
 * Schedules background thumbnail processing
 */
export function scheduleBackgroundThumbnailProcessing(
	ck: CanvasKit,
	fontMgr: FontMgr,
	document: EditorDocument,
	onProgress?: (document: EditorDocument) => void
): void {
	if ('requestIdleCallback' in window) {
		(window as any).requestIdleCallback(
			() => {
				processBackgroundThumbnails(ck, fontMgr, document, onProgress);
			},
			{ timeout: BACKGROUND_THUMBNAIL_CONFIG.START_IDLE_TIMEOUT }
		);
	} else {
		setTimeout(() => {
			processBackgroundThumbnails(ck, fontMgr, document, onProgress);
		}, BACKGROUND_THUMBNAIL_CONFIG.START_DELAY);
	}
}

/**
 * Gets the appropriate delay for thumbnail capture based on whether thumbnail exists
 */
export function getThumbnailCaptureDelay(hasThumbnail: boolean): number {
	return hasThumbnail ? THUMBNAIL_CAPTURE_DELAYS.UPDATE : THUMBNAIL_CAPTURE_DELAYS.INITIAL;
}


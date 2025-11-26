import type { Canvas, CanvasKit, FontMgr } from 'canvaskit-wasm';
import type { TextShape } from '$lib/types/shape';
import { fontFamilies } from '$lib/constants/const';

/**
 * Draws a text shape using CanvasKit Paragraphs.
 * Encapsulates paragraph style creation and lifetime management.
 */
export const drawTextShape = (
	ck: CanvasKit,
	canvas: Canvas,
	fontMgr: FontMgr,
	shape: TextShape
): void => {
	// Derive text color from shape fontColor + fontOpacity
	let textColor = ck.parseColorString(shape.fontColor);
	if (textColor) {
		textColor[3] = textColor[3] * shape.fontOpacity;
	}

	const paraStyle = new ck.ParagraphStyle({
		textStyle: {
			color: textColor ?? ck.BLACK,
			fontFamilies: fontFamilies.length > 0 ? fontFamilies : ['Noto Sans'],
			fontSize: shape.fontSize
		},
		textAlign: ck.TextAlign.Left
	});

	const builder = ck.ParagraphBuilder.Make(paraStyle, fontMgr);
	builder.addText(shape.text);

	const paragraph = builder.build();
	paragraph.layout(shape.width);

	canvas.drawParagraph(paragraph, shape.x, shape.y);

	paragraph.delete();
	builder.delete();
};

/**
 * Calculates the optimal font size to fit text within given dimensions
 * Uses binary search to find the largest font size that fits
 */
export function calculateFitFontSize(
	ck: CanvasKit,
	fontMgr: FontMgr,
	text: string,
	maxWidth: number,
	maxHeight: number,
	minFontSize: number = 8,
	maxFontSize: number = 2000
): number {
	// Handle empty text
	if (!text || text.trim().length === 0) {
		return minFontSize;
	}

	// Handle very small shapes
	if (maxWidth < 10 || maxHeight < 10) {
		return minFontSize;
	}

	let low = minFontSize;
	let high = maxFontSize;
	let bestFit = minFontSize;

	// Binary search for optimal font size
	while (low <= high) {
		const mid = Math.floor((low + high) / 2);

		// Test if text fits at this font size
		const paraStyle = new ck.ParagraphStyle({
			textStyle: {
				color: ck.BLACK,
				fontFamilies: fontFamilies.length > 0 ? fontFamilies : ['Noto Sans'],
				fontSize: mid
			},
			textAlign: ck.TextAlign.Left
		});

		const builder = ck.ParagraphBuilder.Make(paraStyle, fontMgr);
		builder.addText(text);
		const paragraph = builder.build();
		paragraph.layout(maxWidth);

		const height = paragraph.getHeight();
		const longestLine = paragraph.getLongestLine();

		// Clean up
		paragraph.delete();
		builder.delete();

		// Check if text fits within bounds
		if (height <= maxHeight && longestLine <= maxWidth) {
			// Text fits, try larger font size
			bestFit = mid;
			low = mid + 1;
		} else {
			// Text doesn't fit, try smaller font size
			high = mid - 1;
		}
	}

	return bestFit;
}

/**
 * Calculates the dimensions (width and height) needed to fit text at a given font size
 * Returns the exact dimensions required to display the text
 * Text will NOT wrap - it stays on a single line
 */
export function calculateTextDimensions(
	ck: CanvasKit,
	fontMgr: FontMgr,
	text: string,
	fontSize: number
): { width: number; height: number } {
	// Handle empty text
	if (!text || text.trim().length === 0) {
		return { width: 100, height: fontSize * 1.5 };
	}

	// Create paragraph with the given font size
	const paraStyle = new ck.ParagraphStyle({
		textStyle: {
			color: ck.BLACK,
			fontFamilies: fontFamilies.length > 0 ? fontFamilies : ['Noto Sans'],
			fontSize: fontSize
		},
		textAlign: ck.TextAlign.Left
	});

	const builder = ck.ParagraphBuilder.Make(paraStyle, fontMgr);
	builder.addText(text);
	const paragraph = builder.build();

	// Use very large width to prevent wrapping - text stays on single line
	paragraph.layout(100000);

	const height = paragraph.getHeight();
	const longestLine = paragraph.getLongestLine();

	// Clean up
	paragraph.delete();
	builder.delete();

	// Add some padding for better appearance
	const padding = 5;
	return {
		width: Math.ceil(longestLine) + padding,
		height: Math.ceil(height) + padding
	};
}

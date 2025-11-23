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



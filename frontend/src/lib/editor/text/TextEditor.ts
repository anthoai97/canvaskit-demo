import type { CanvasKit, FontMgr, Paragraph } from 'canvaskit-wasm';
import type { TextShape } from '$lib/types/shape';
import { PhantomTextArea } from './PhantomTextArea';
import { TextModel } from './TextModel';
import { fontFamilies } from '$lib/constants/const';

import type { CameraState } from '$lib/types/camera';

export interface TextEditorEvents {
	onUpdate: (text: string) => void;
	onStop: () => void;
	onCursorMove: () => void;
}

export class TextEditor {
	private ck: CanvasKit;
	private fontMgr: FontMgr;
	private shape: TextShape;
	private phantom: PhantomTextArea;
	private model: TextModel;
	private callbacks: TextEditorEvents;

	private cursorIndex: number = 0;
	private selectionStart: number | null = null; // For future selection support

	constructor(
		ck: CanvasKit,
		fontMgr: FontMgr,
		shape: TextShape,
		container: HTMLElement,
		cameraState: CameraState,
		callbacks: TextEditorEvents
	) {
		this.ck = ck;
		this.fontMgr = fontMgr;
		this.shape = shape;
		this.callbacks = callbacks;
		this.model = new TextModel(shape.text);
		this.cursorIndex = shape.text.length; // Start cursor at end

		this.phantom = new PhantomTextArea(container);
		this.phantom.addEventListener('insert', (e) => this.handleInsert(e.text));
		this.phantom.addEventListener('backspace', () => this.handleBackspace());
		this.phantom.addEventListener('delete', () => this.handleDelete());
		this.phantom.addEventListener('left', () => this.moveCursor(-1));
		this.phantom.addEventListener('right', () => this.moveCursor(1));
		this.phantom.addEventListener('enter', () => this.handleInsert('\n'));

		// Initial layout
		this.updateLayout(cameraState);

		// Focus immediately
		this.phantom.focus();
	}

	public updateLayout(cameraState: CameraState) {
		const { zoom, panX, panY } = cameraState;
		const screenX = this.shape.x * zoom + panX;
		const screenY = this.shape.y * zoom + panY;
		const screenFontSize = this.shape.fontSize * zoom;

		this.phantom.move(screenX, screenY);
		this.phantom.height = screenFontSize;
	}

	private handleInsert(text: string) {
		const [newModel, newPos] = this.model.insert(this.cursorIndex, text);
		this.model = newModel;
		this.cursorIndex = newPos;
		this.updateShape();
	}

	private handleBackspace() {
		if (this.cursorIndex > 0) {
			const [newModel, newPos] = this.model.deleteBackward(this.cursorIndex);
			this.model = newModel;
			this.cursorIndex = newPos;
			this.updateShape();
		}
	}

	private handleDelete() {
		if (this.cursorIndex < this.model.text.length) {
			const [newModel, newPos] = this.model.deleteForward(this.cursorIndex);
			this.model = newModel;
			this.cursorIndex = newPos;
			this.updateShape();
		}
	}

	private moveCursor(delta: number) {
		this.cursorIndex = this.model.clampPosition(this.cursorIndex + delta);
		this.callbacks.onCursorMove();
		// TODO: Handle up/down navigation using paragraph metrics
	}

	private updateShape() {
		this.shape.text = this.model.text;
		this.callbacks.onUpdate(this.model.text);
	}

	public stop() {
		this.phantom.destroy();
		this.callbacks.onStop();
	}

	// Helper to build paragraph for metrics (duplicated from drawTextShape for now)
	// In a real app, we might want to cache this or share logic
	private buildParagraph(): Paragraph {
		const paraStyle = new this.ck.ParagraphStyle({
			textStyle: {
				color: this.ck.BLACK, // Color doesn't matter for metrics
				fontFamilies: fontFamilies.length > 0 ? fontFamilies : ['Noto Sans'],
				fontSize: this.shape.fontSize
			},
			textAlign: this.ck.TextAlign.Left
		});

		const builder = this.ck.ParagraphBuilder.Make(paraStyle, this.fontMgr);
		builder.addText(this.model.text);
		const paragraph = builder.build();
		paragraph.layout(this.shape.width);
		builder.delete();
		return paragraph;
	}

	public getCursorRect(): Float32Array | null {
		const paragraph = this.buildParagraph();

		let low: number;
		let high: number;
		let useRightEdge = false;

		// Special case: cursor at the beginning
		if (this.cursorIndex === 0) {
			[low, high] = [0, 1];
		}
		// Special case: cursor at the end
		else if (this.cursorIndex === this.model.text.length) {
			[low, high] = [this.cursorIndex - 1, this.cursorIndex];
			useRightEdge = true;
		}
		// Normal case: cursor in the middle
		else {
			[low, high] = [this.cursorIndex, this.cursorIndex + 1];
		}

		console.log('[TextEditor] getCursorRect:', {
			cursorIndex: this.cursorIndex,
			textLength: this.model.text.length,
			text: this.model.text,
			low,
			high,
			useRightEdge
		});

		const rects = paragraph.getRectsForRange(
			low,
			high,
			this.ck.RectHeightStyle.Max,
			this.ck.RectWidthStyle.Tight
		);

		console.log('[TextEditor] getRectsForRange returned:', rects.length, 'rects');

		let cursorRect: Float32Array | null = null;

		if (rects.length > 0) {
			const rect = rects[0].rect;
			const [x0, y0, x1, y1] = rect;
			// Create a thin vertical line for the cursor
			const cursorX = useRightEdge ? x1 : x0;
			const cursorWidth = 2; // 2px wide cursor
			cursorRect = Float32Array.of(cursorX, y0, cursorX + cursorWidth, y1);
			console.log('[TextEditor] Cursor rect created:', {
				x0, y0, x1, y1,
				cursorX,
				cursorWidth,
				finalRect: Array.from(cursorRect)
			});
		} else {
			// Fallback for empty text
			cursorRect = Float32Array.of(0, 0, 2, this.shape.fontSize);
			console.log('[TextEditor] Using fallback cursor rect:', Array.from(cursorRect));
		}

		paragraph.delete();
		return cursorRect;
	}
}

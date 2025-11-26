import { TypedEventTarget } from '../TypedEventTarget';

export type PhantomTextAreaEventMap = {
	insert: { type: "insert"; text: string };
	backspace: { type: "backspace" };
	delete: { type: "delete" };
	up: { type: "up" };
	down: { type: "down" };
	left: { type: "left" };
	right: { type: "right" };
	enter: { type: "enter" };
	undo: { type: "undo" };
};

export class PhantomTextArea extends TypedEventTarget<PhantomTextAreaEventMap> {
	private _element = document.createElement("textarea");
	private _container = document.body; // Default to body if container not found
	private _isCompositionStarted = false;
	private _heightInPixel = 24;
	private _widthInPixel = 0;

	private _initializeAttributes(): void {
		this._element.style.width = `${this._widthInPixel}px`;
		this._element.style.height = `${this._heightInPixel}px`;
	}

	public constructor(container?: HTMLElement) {
		super();

		if (container) {
			this._container = container;
		}

		this._element.classList.add("phantom-textarea");
		// Style to make it invisible but functional
		this._element.style.position = 'absolute';
		this._element.style.opacity = '0';
		this._element.style.pointerEvents = 'none';
		this._element.style.zIndex = '-1';
		this._element.style.overflow = 'hidden';
		this._element.style.padding = '0';
		this._element.style.border = 'none';
		this._element.style.resize = 'none';

		this._element.setAttribute("autocorrect", "off");
		this._element.autocapitalize = "none";
		this._element.autocomplete = "off";
		this._element.spellcheck = false;
		this._element.tabIndex = 0;
		this._element.wrap = "off";
		this._element.setAttribute("role", "textbox");
		this._element.setAttribute("aria-multiline", "true");
		this._element.setAttribute("aria-haspopup", "false");
		this._element.setAttribute("aria-autocomplete", "both");

		this._initializeAttributes();

		this._element.addEventListener("compositionstart", (e) => {
			this._isCompositionStarted = true;
		});
		this._element.addEventListener("compositionend", (e) => {
			if (e.data.length > 0) {
				this.dispatchEvent({ type: "insert", text: e.data });
			}
			this._element.value = "";
			this._isCompositionStarted = false;
		});
		this._element.addEventListener("input", (e: Event) => {
			if (this._isCompositionStarted) {
				return;
			}
			// Cast to InputEvent to check inputType if needed, but value check is usually enough
			const value = this._element.value;
			if (value.length > 0) {
				this.dispatchEvent({ type: "insert", text: value });
				this._element.value = "";
			}
		});
		this._element.addEventListener("keydown", (e) => {
			// Handle Ctrl+Z / Cmd+Z for undo
			if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
				e.preventDefault();
				this.dispatchEvent({ type: "undo" });
				return;
			}

			switch (e.key) {
				case "Backspace":
					this.dispatchEvent({ type: "backspace" });
					break;
				case "Delete":
					this.dispatchEvent({ type: "delete" });
					break;
				case "ArrowUp":
					this.dispatchEvent({ type: "up" });
					break;
				case "ArrowDown":
					this.dispatchEvent({ type: "down" });
					break;
				case "ArrowLeft":
					this.dispatchEvent({ type: "left" });
					break;
				case "ArrowRight":
					this.dispatchEvent({ type: "right" });
					break;
				case "Enter":
					e.preventDefault();
					this.dispatchEvent({ type: "enter" });
					break;
			}
		});

		this._container.appendChild(this._element);
	}

	public get height(): number {
		return this._heightInPixel;
	}

	public set height(value: number) {
		this._heightInPixel = value;
		this._element.style.height = `${value}px`;
	}

	public move(x: number, y: number): void {
		this._element.style.top = `${y}px`;
		this._element.style.left = `${x}px`;
	}

	public focus(): void {
		this._element.focus();
	}

	public blur(): void {
		this._element.blur();
	}

	public show(): void {
		this._element.style.display = "block";
	}

	public hide(): void {
		this._element.style.display = "none";
	}

	public destroy(): void {
		this._element.remove();
	}
}

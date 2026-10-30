import type { Key, WheelMode } from "./input.ts";

/**
 * Events a {@link CanvasHost} reports.
 *
 * Pointer positions are CSS pixels relative to the element's top-left
 * corner. `inside` is `false` when the pointer is outside the element.
 *
 * @example
 * ```ts
 * host.on("wheel", ({ delta_mode, delta_y }) => {
 *   console.log(delta_mode, delta_y);
 * });
 * ```
 */
export type CanvasHostEventMap = {
	resize: {
		css_width: number;
		css_height: number;
		pixel_width: number;
		pixel_height: number;
		dpr: number;
	};
	pointermove: {
		x: number;
		y: number;
		inside: boolean;
	};
	pointerdown: {
		x: number;
		y: number;
	};
	pointerup: {
		x: number;
		y: number;
	};
	pointercancel: {};
	pointerleave: {};
	wheel: {
		delta_mode: WheelMode;
		delta_y: number;
	};
	keydown: Key;
	keyup: Key;
	focus: {};
	blur: {};
};

/**
 * The browser-facing surface a {@link Canvas} needs.
 *
 * A host reports the element's CSS and device-pixel size, device pixel
 * ratio, focus state, and normalized pointer, wheel, and keyboard events.
 * It does not know the cell grid, the WebGL context, or the application.
 *
 * {@link WebCanvasHost} implements this over an `HTMLCanvasElement`;
 * {@link TestCanvasHost} implements it headlessly and lets tests inject
 * events directly.
 *
 * @example
 * ```ts
 * const host: CanvasHost = new WebCanvasHost(canvasElement);
 * ```
 */
export interface CanvasHost {
	/** Element width in CSS pixels. */
	readonly css_width: number;
	/** Element height in CSS pixels. */
	readonly css_height: number;
	/** Element width in device pixels. */
	readonly pixel_width: number;
	/** Element height in device pixels. */
	readonly pixel_height: number;
	/** Device pixel ratio the pixel dimensions were derived from. */
	readonly dpr: number;
	/** Whether the element is focused. */
	readonly focused: boolean;

	/**
	 * Subscribe to one host event.
	 *
	 * @param type      Event name.
	 * @param listener  Called with the normalized event payload.
	 * @returns         A function that removes the listener.
	 */
	on<K extends keyof CanvasHostEventMap>(
		type: K,
		listener: (event: CanvasHostEventMap[K]) => void,
	): () => void;

	/** Remove listeners and release host resources. */
	dispose(): void;
}

abstract class CanvasHostBase implements CanvasHost {
	css_width = 0;
	css_height = 0;
	pixel_width = 0;
	pixel_height = 0;
	dpr = 1;
	focused = false;

	private readonly listeners = new Map<
		string,
		Set<(event: unknown) => void>
	>();

	on<K extends keyof CanvasHostEventMap>(
		type: K,
		listener: (event: CanvasHostEventMap[K]) => void,
	): () => void {
		let listeners = this.listeners.get(type);

		if (listeners === undefined) {
			listeners = new Set();
			this.listeners.set(type, listeners);
		}

		const stored = listener as (event: unknown) => void;

		listeners.add(stored);

		return () => {
			listeners.delete(stored);
		};
	}

	protected emit<K extends keyof CanvasHostEventMap>(
		type: K,
		event: CanvasHostEventMap[K],
	): void {
		const listeners = this.listeners.get(type);

		if (listeners === undefined) {
			return;
		}

		for (const listener of listeners) {
			listener(event);
		}
	}

	dispose(): void {
		this.listeners.clear();
	}
}

/**
 * A {@link CanvasHost} backed by an `HTMLCanvasElement`.
 *
 * Owns the element's CSS/device sizing, focus state, pointer capture, and
 * native pointer, wheel, and keyboard listeners. Resizing applies
 * `devicePixelRatio` to the element's backing store and emits a normalized
 * `"resize"` event.
 *
 * @example
 * ```ts
 * const host = new WebCanvasHost(canvasElement);
 * const gl = canvasElement.getContext("webgl2");
 * const canvas = new Canvas(host, gl);
 * ```
 */
export class WebCanvasHost extends CanvasHostBase {
	/** The `<canvas>` element this host observes. */
	readonly element: HTMLCanvasElement;

	private readonly on_pointer_move = (event: PointerEvent): void => {
		this.emit("pointermove", this.point(event.clientX, event.clientY));
	};

	private readonly on_pointer_down = (event: PointerEvent): void => {
		event.preventDefault();

		const point = this.point(event.clientX, event.clientY);

		this.emit("pointerdown", point);
		this.element.setPointerCapture(event.pointerId);
	};

	private readonly on_pointer_up = (event: PointerEvent): void => {
		this.emit("pointerup", this.point(event.clientX, event.clientY));
	};

	private readonly on_pointer_cancel = (): void => {
		this.emit("pointercancel", {});
	};

	private readonly on_pointer_leave = (): void => {
		this.emit("pointerleave", {});
	};

	private readonly on_wheel = (event: WheelEvent): void => {
		event.preventDefault();

		const mode = event.deltaMode === 1 || event.deltaMode === 2
			? event.deltaMode
			: 0;

		this.emit("wheel", {
			delta_mode: mode,
			delta_y: event.deltaY,
		});
	};

	private readonly on_key_down = (event: KeyboardEvent): void => {
		if (this.is_form_target(event.target)) {
			return;
		}

		this.emit("keydown", this.key(event));
	};

	private readonly on_key_up = (event: KeyboardEvent): void => {
		if (this.is_form_target(event.target)) {
			return;
		}

		this.emit("keyup", this.key(event));
	};

	private readonly on_focus = (): void => {
		this.focused = true;
		this.emit("focus", {});
	};

	private readonly on_blur = (): void => {
		this.focused = false;
		this.emit("blur", {});
	};

	private readonly on_resize = (): void => {
		this.resize();
	};

	private readonly on_context_menu = (event: MouseEvent): void => {
		event.preventDefault();
	};

	/**
	 * Create a host for the given element.
	 *
	 * Makes the element focusable when it has no `tabindex`, observes its
	 * size, and attaches normalized input listeners.
	 *
	 * @param element  The `<canvas>` element to observe.
	 */
	constructor(element: HTMLCanvasElement) {
		super();
		this.element = element;

		if (!element.hasAttribute("tabindex")) {
			element.tabIndex = 0;
		}

		this.resize();

		window.addEventListener("resize", this.on_resize);
		window.addEventListener("pointermove", this.on_pointer_move);
		window.addEventListener("keydown", this.on_key_down);
		window.addEventListener("keyup", this.on_key_up);
		window.addEventListener("blur", this.on_blur);

		element.addEventListener("pointerdown", this.on_pointer_down);
		element.addEventListener("pointerup", this.on_pointer_up);
		element.addEventListener("pointercancel", this.on_pointer_cancel);
		element.addEventListener("pointerleave", this.on_pointer_leave);
		element.addEventListener("wheel", this.on_wheel, { passive: false });
		element.addEventListener("contextmenu", this.on_context_menu);
		element.addEventListener("focus", this.on_focus);
		element.addEventListener("blur", this.on_blur);
	}

	/** Remove all DOM and host listeners. */
	override dispose(): void {
		window.removeEventListener("resize", this.on_resize);
		window.removeEventListener("pointermove", this.on_pointer_move);
		window.removeEventListener("keydown", this.on_key_down);
		window.removeEventListener("keyup", this.on_key_up);
		window.removeEventListener("blur", this.on_blur);

		this.element.removeEventListener("pointerdown", this.on_pointer_down);
		this.element.removeEventListener("pointerup", this.on_pointer_up);
		this.element.removeEventListener("pointercancel", this.on_pointer_cancel);
		this.element.removeEventListener("pointerleave", this.on_pointer_leave);
		this.element.removeEventListener("wheel", this.on_wheel);
		this.element.removeEventListener("contextmenu", this.on_context_menu);
		this.element.removeEventListener("focus", this.on_focus);
		this.element.removeEventListener("blur", this.on_blur);

		super.dispose();
	}

	private resize(): void {
		const dpr = window.devicePixelRatio || 1;
		const css_width = this.element.clientWidth;
		const css_height = this.element.clientHeight;
		const pixel_width = css_width * dpr;
		const pixel_height = css_height * dpr;

		if (
			css_width === this.css_width &&
			css_height === this.css_height &&
			dpr === this.dpr
		) {
			return;
		}

		this.css_width = css_width;
		this.css_height = css_height;
		this.pixel_width = pixel_width;
		this.pixel_height = pixel_height;
		this.dpr = dpr;

		this.element.width = pixel_width;
		this.element.height = pixel_height;

		this.emit("resize", {
			css_width,
			css_height,
			pixel_width,
			pixel_height,
			dpr,
		});
	}

	private point(client_x: number, client_y: number) {
		const rect = this.element.getBoundingClientRect();
		const x = client_x - rect.left;
		const y = client_y - rect.top;

		return {
			x,
			y,
			inside: x >= 0 && y >= 0 && x < rect.width && y < rect.height,
		};
	}

	private key(event: KeyboardEvent): Key {
		const key: Key = {
			key: event.key,
			ctrl: event.ctrlKey,
			alt: event.altKey,
			meta: event.metaKey,
			shift: event.shiftKey,
			repeat: event.repeat,
			default_prevented: false,
			prevent_default: () => {
				key.default_prevented = true;
				event.preventDefault();
			},
		};

		return key;
	}

	private is_form_target(target: EventTarget | null): boolean {
		const element = target as HTMLElement | null;

		return (
			element !== null &&
			(element.tagName === "INPUT" ||
				element.tagName === "TEXTAREA" ||
				element.isContentEditable)
		);
	}
}

/**
 * A headless {@link CanvasHost} for tests.
 *
 * Reports virtual CSS/device dimensions and lets a test inject pointer,
 * wheel, keyboard, focus, and resize events. It never touches the DOM.
 *
 * @example
 * ```ts
 * const host = new TestCanvasHost({ css_width: 800, css_height: 480 });
 * host.pointerAtCell(3, 4, 30, 100);
 * host.pointerDown(4, 32);
 * ```
 */
export class TestCanvasHost extends CanvasHostBase {
	/** Whether the last injected key event called `prevent_default`. */
	default_prevented = false;

	/**
	 * Create a headless host.
	 *
	 * @param options  Virtual CSS dimensions and optional device pixel ratio.
	 */
	constructor(options: {
		css_width: number;
		css_height: number;
		dpr?: number;
	}) {
		super();
		this.resize(options.css_width, options.css_height, options.dpr);
	}

	/**
	 * Change the virtual element size.
	 *
	 * @param css_width   New CSS width.
	 * @param css_height  New CSS height.
	 * @param dpr         New device pixel ratio; defaults to the current one.
	 */
	resize(css_width: number, css_height: number, dpr = this.dpr): void {
		if (
			css_width === this.css_width &&
			css_height === this.css_height &&
			dpr === this.dpr
		) {
			return;
		}

		this.css_width = css_width;
		this.css_height = css_height;
		this.dpr = dpr;
		this.pixel_width = css_width * dpr;
		this.pixel_height = css_height * dpr;

		this.emit("resize", {
			css_width,
			css_height,
			pixel_width: this.pixel_width,
			pixel_height: this.pixel_height,
			dpr,
		});
	}

	/** Focus the virtual element and emit `"focus"`. */
	focus(): void {
		this.focused = true;
		this.emit("focus", {});
	}

	/** Blur the virtual element and emit `"blur"`. */
	blur(): void {
		this.focused = false;
		this.emit("blur", {});
	}

	/**
	 * Move the virtual pointer.
	 *
	 * @param x  CSS x position relative to the element.
	 * @param y  CSS y position relative to the element.
	 */
	pointerMove(x: number, y: number): void {
		this.emit("pointermove", {
			x,
			y,
			inside: x >= 0 && y >= 0 && x < this.css_width && y < this.css_height,
		});
	}

	/**
	 * Move the virtual pointer to the centre of a cell.
	 *
	 * @param row   Cell row.
	 * @param col   Cell column.
	 * @param rows  Number of cell rows.
	 * @param cols  Number of cell columns.
	 */
	pointerAtCell(row: number, col: number, rows: number, cols: number): void {
		this.pointerMove(
			((col + 0.5) / cols) * this.css_width,
			((row + 0.5) / rows) * this.css_height,
		);
	}

	/**
	 * Press the virtual pointer.
	 *
	 * @param x  CSS x position relative to the element.
	 * @param y  CSS y position relative to the element.
	 */
	pointerDown(x: number, y: number): void {
		this.emit("pointerdown", { x, y });
	}

	/**
	 * Release the virtual pointer.
	 *
	 * @param x  CSS x position relative to the element.
	 * @param y  CSS y position relative to the element.
	 */
	pointerUp(x: number, y: number): void {
		this.emit("pointerup", { x, y });
	}

	/** Cancel the virtual pointer. */
	pointerCancel(): void {
		this.emit("pointercancel", {});
	}

	/** Move the virtual pointer out of the element. */
	pointerLeave(): void {
		this.emit("pointerleave", {});
	}

	/**
	 * Emit a wheel event.
	 *
	 * @param delta_y     Vertical wheel delta.
	 * @param delta_mode  Wheel delta mode; defaults to pixels.
	 */
	wheel(delta_y: number, delta_mode: WheelMode = 0): void {
		this.emit("wheel", {
			delta_mode,
			delta_y,
		});
	}

	/**
	 * Emit a keydown event.
	 *
	 * @param key      Key name.
	 * @param options  Modifier and repeat state.
	 */
	keyDown(
		key: string,
		options: Partial<Omit<Key, "key" | "default_prevented" | "prevent_default">> = {},
	): void {
		this.default_prevented = false;
		this.emit("keydown", this.key(key, options));
	}

	/**
	 * Emit a keyup event.
	 *
	 * @param key      Key name.
	 * @param options  Modifier and repeat state.
	 */
	keyUp(
		key: string,
		options: Partial<Omit<Key, "key" | "default_prevented" | "prevent_default">> = {},
	): void {
		this.default_prevented = false;
		this.emit("keyup", this.key(key, options));
	}

	private key(
		name: string,
		options: Partial<Omit<Key, "key" | "default_prevented" | "prevent_default">>,
	): Key {
		const key: Key = {
			key: name,
			ctrl: options.ctrl ?? false,
			alt: options.alt ?? false,
			meta: options.meta ?? false,
			shift: options.shift ?? false,
			repeat: options.repeat ?? false,
			default_prevented: false,
			prevent_default: () => {
				key.default_prevented = true;
				this.default_prevented = true;
			},
		};

		return key;
	}
}

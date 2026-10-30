import { WebCanvasHost, type CanvasHost } from "./canvas_host.ts";
import { PALETTE } from "./colour.ts";
import { pointerCell, scrollRowsForKey, wheelRows, type Key, type WheelMode } from "./input.ts";
import { loadModernDosTexture } from "./moderndos.ts";

/**
 * A WebGL2 canvas presented as a grid of character cells.
 *
 * `Canvas` owns the cell grid dimensions, the colour {@link palette}, the
 * built-in bitmap font texture ({@link bitmap_font}), an optional
 * application-provided font ({@link user_font}), and pointer/wheel/keyboard
 * state. It reads the browser surface through a {@link CanvasHost} and draws
 * through an injected WebGL2 context.
 *
 * It is an `EventTarget`: it dispatches `"resize"` when the grid dimensions
 * change, `"wheel"` (a `CustomEvent` with `detail.rows`) on scroll, and
 * `"keydown"` / `"keyup"` with a {@link Key} detail. Calling
 * `detail.prevent_default()` suppresses both the browser default and the
 * built-in keyboard scrolling for that key.
 *
 * Use {@link Canvas.from} for the normal browser construction, or pass a
 * {@link TestCanvasHost} and a headless WebGL2 context in tests.
 *
 * @example
 * ```ts
 * const canvas = Canvas.from(document.querySelector("canvas")!);
 * const terminal = new Terminal(canvas);
 * ```
 */
export class Canvas extends EventTarget {
	/**
	 * Width of a single cell, in CSS pixels at 100% zoom and DPR 1.
	 *
	 * Used as the base unit from which {@link actual_cell_width} is derived
	 * after accounting for device pixel ratio.
	 */
	static readonly CELL_WIDTH = 8;
	/**
	 * Height of a single cell, in CSS pixels at 100% zoom and DPR 1.
	 *
	 * Used as the base unit from which {@link actual_cell_height} is
	 * derived after accounting for device pixel ratio.
	 */
	static readonly CELL_HEIGHT = 16;

	/** The browser surface this canvas reads input and size from. */
	readonly host: CanvasHost;
	/** The WebGL2 rendering context this canvas draws through. */
	readonly gl: WebGL2RenderingContext;

	private readonly unsubscribers: (() => void)[] = [];

	private wheel_px: number;

	/** Width of the canvas in device pixels (CSS pixels x DPR). */
	width = 0;
	/** Height of the canvas in device pixels (CSS pixels x DPR). */
	height = 0;

	/** Number of cell rows currently visible on the canvas. */
	rows = 1;
	/** Number of cell columns currently visible on the canvas. */
	cols = 1;

	/** Height of a single cell in device pixels. */
	actual_cell_height = 0;
	/** Width of a single cell in device pixels. */
	actual_cell_width = 0;

	/**
	 * Name of the component that currently "owns" the mouse, or `""` when
	 * unclaimed. Components doing drag-style interaction set this to a
	 * unique name when a press begins inside their region and clear it
	 * when the press ends, so other components can avoid stealing the
	 * gesture mid-drag.
	 */
	mouse_owner = "";

	/** Cell row the pointer is over, or `undefined` if off-canvas. */
	mouse_row: number | undefined = undefined;
	/** Cell column the pointer is over, or `undefined` if off-canvas. */
	mouse_col: number | undefined = undefined;

	/** `true` while a pointer button is held down on the canvas. */
	mouse_down = false;
	/**
	 * `true` for one frame after a pointer press is released (a click).
	 * Intended to be consumed (reset to `false`) by the draw loop after
	 * components have processed it.
	 */
	mouse_click = false;
	/** Cell row where the current press started, or `undefined`. */
	mouse_down_row: number | undefined = undefined;
	/** Cell column where the current press started, or `undefined`. */
	mouse_down_col: number | undefined = undefined;

	/**
	 * The 16-colour palette as normalised `[R, G, B]` floats (divided by
	 * `0xff`), derived from {@link PALETTE}.
	 */
	palette: Float32Array;

	/**
	 * The built-in 8x16 bitmap font as a WebGL2 integer texture.
	 * This is the Modern DOS CP437 font baked into tscon.
	 */
	bitmap_font: WebGLTexture;

	/**
	 * Optional application-provided font texture, or `null`. When set,
	 * {@link Terminal}/{@link Renderer} use it for non-box-drawing glyphs
	 * (those with char codes outside 176..223). Generate one with
	 * {@link renderCp437} and {@link loadTexture}.
	 */
	user_font: WebGLTexture | null;

	/**
	 * CSS class name for the body cursor, set by components during a frame
	 * (e.g. `"pointer"` when hovering a link) and reset to `""` on
	 * {@link clear}.
	 */
	class_name = "";

	/**
	 * Create a canvas over a host and an injected WebGL2 context.
	 *
	 * The host supplies element dimensions and normalized input events. The
	 * context is used for clearing, the built-in font, and all rendering by
	 * {@link Terminal} and {@link Renderer}.
	 *
	 * @param host  Browser or test surface to read from.
	 * @param gl    WebGL2 context to draw through.
	 */
	constructor(host: CanvasHost, gl: WebGL2RenderingContext) {
		super();
		this.host = host;
		this.gl = gl;
		this.wheel_px = 0;
		this.palette = new Float32Array(
			PALETTE.flat().map((byte) => byte / 0xff),
		);
		this.bitmap_font = loadModernDosTexture(gl);
		this.user_font = null;

		this.resize();

		this.unsubscribers.push(
			host.on("resize", () => this.resize()),
			host.on("pointermove", (event) => {
				this.movePointer(event.x, event.y);
			}),
			host.on("pointerdown", (event) => {
				this.press(event.x, event.y);
			}),
			host.on("pointerup", () => this.release(true)),
			host.on("pointercancel", () => this.release(false)),
			host.on("pointerleave", () => this.release(false)),
			host.on("wheel", (event) => {
				this.scroll(event.delta_mode, event.delta_y);
			}),
			host.on("keydown", (event) => this.pressKey(event)),
			host.on("keyup", (event) => this.releaseKey(event)),
			host.on("blur", () => this.cancelPress()),
		);
	}

	/**
	 * Create a browser canvas from an `HTMLCanvasElement`.
	 *
	 * Builds a {@link WebCanvasHost}, acquires a WebGL2 context, and returns
	 * the canvas. Throws when WebGL2 is unavailable.
	 *
	 * @example
	 * ```ts
	 * const canvas = Canvas.from(document.querySelector("canvas")!);
	 * ```
	 *
	 * @param element  The `<canvas>` element to render into.
	 * @returns        A canvas backed by the element.
	 * @throws         When a WebGL2 context cannot be acquired.
	 */
	static from(element: HTMLCanvasElement): Canvas {
		const host = new WebCanvasHost(element);
		const gl = element.getContext("webgl2");

		if (!gl) {
			host.dispose();
			throw new Error("No WebGL2 context");
		}

		return new Canvas(host, gl);
	}

	/**
	 * Whether the pointer is currently inside the given cell rectangle.
	 *
	 * @param row   Top row of the rectangle.
	 * @param col   Left column of the rectangle.
	 * @param rows  Height of the rectangle in cells.
	 * @param cols  Width of the rectangle in cells.
	 * @returns     `true` if {@link mouse_row}/{@link mouse_col} fall
	 *             inside.
	 */
	mouseAt(row: number, col: number, rows: number, cols: number): boolean {
		return (
			this.mouse_row !== undefined &&
			this.mouse_col !== undefined &&
			this.mouse_row >= row &&
			this.mouse_row < row + rows &&
			this.mouse_col >= col &&
			this.mouse_col < col + cols
		);
	}

	/**
	 * Whether the current press started inside the given cell rectangle.
	 *
	 * Use this for click hit-testing: it checks where the press began
	 * ({@link mouse_down_row}/{@link mouse_down_col}), not where the
	 * pointer is now, so a drag that leaves the rectangle still counts as
	 * a click on it.
	 *
	 * @param row   Top row of the rectangle.
	 * @param col   Left column of the rectangle.
	 * @param rows  Height of the rectangle in cells.
	 * @param cols  Width of the rectangle in cells.
	 * @returns     `true` if the press started inside the rectangle.
	 */
	mouseDownAt(
		row: number,
		col: number,
		rows: number,
		cols: number,
	): boolean {
		return (
			this.mouse_down_row !== undefined &&
			this.mouse_down_col !== undefined &&
			this.mouse_down_row >= row &&
			this.mouse_down_row < row + rows &&
			this.mouse_down_col >= col &&
			this.mouse_down_col < col + cols
		);
	}

	/**
	 * Clears the framebuffer with the palette background colour
	 * ({@link palette}[0..2]) and resets {@link class_name} to `""`.
	 *
	 * Call at the start of every frame, before rendering content.
	 */
	clear(): void {
		const gl = this.gl;

		gl.clearColor(
			this.palette[0],
			this.palette[1],
			this.palette[2],
			1.0,
		);
		gl.clear(gl.COLOR_BUFFER_BIT);

		this.class_name = "";
	}

	/** Stop listening to the host and release it. */
	dispose(): void {
		for (const unsubscribe of this.unsubscribers) {
			unsubscribe();
		}

		this.unsubscribers.length = 0;
		this.host.dispose();
	}

	private resize(): void {
		const host = this.host;
		const gl = this.gl;

		this.width = host.pixel_width;
		this.height = host.pixel_height;

		gl.viewport(0, 0, this.width, this.height);

		const target_cell_height = Math.max(
			Canvas.CELL_HEIGHT / 2,
			Canvas.CELL_HEIGHT * host.dpr,
		);
		const target_cell_width = Math.max(
			Canvas.CELL_WIDTH / 2,
			Canvas.CELL_WIDTH * host.dpr,
		);

		const rows = Math.round(
			Math.min(
				Math.max(1, this.height / target_cell_height),
				256,
			),
		);
		const cols = Math.round(
			Math.min(
				Math.max(1, this.width / target_cell_width),
				1024,
			),
		);

		this.actual_cell_height = this.height / rows;
		this.actual_cell_width = this.width / cols;

		this.mouse_owner = "";
		this.mouse_row = undefined;
		this.mouse_col = undefined;
		this.mouse_down = false;
		this.mouse_click = false;
		this.mouse_down_row = undefined;
		this.mouse_down_col = undefined;

		if (rows !== this.rows || cols !== this.cols) {
			this.rows = rows;
			this.cols = cols;

			this.dispatchEvent(new Event("resize"));
		}
	}

	private movePointer(x: number, y: number): void {
		const cell = pointerCell(
			x,
			y,
			this.host.css_width,
			this.host.css_height,
			this.rows,
			this.cols,
		);

		this.mouse_row = cell?.row;
		this.mouse_col = cell?.col;
	}

	private press(x: number, y: number): void {
		this.movePointer(x, y);
		this.mouse_down = true;
		this.mouse_down_row = this.mouse_row;
		this.mouse_down_col = this.mouse_col;
	}

	private release(click: boolean): void {
		this.mouse_down = false;

		if (click) {
			this.mouse_click = true;
		}
	}

	private cancelPress(): void {
		this.mouse_down = false;
		this.mouse_click = false;
	}

	private scroll(delta_mode: WheelMode, delta_y: number): void {
		const cell_height = this.rows > 0
			? this.host.css_height / this.rows
			: 0;

		this.wheel_px += wheelRows(
			delta_mode,
			delta_y,
			cell_height,
			this.rows,
		);

		const rows = Math.trunc(this.wheel_px);

		if (rows === 0) {
			return;
		}

		this.wheel_px -= rows;
		this.dispatchWheel(rows);
	}

	private pressKey(key: Key): void {
		this.dispatchEvent(new CustomEvent<Key>("keydown", {
			detail: key,
		}));

		if (key.default_prevented) {
			return;
		}

		const rows = scrollRowsForKey(key.key);
		const active = this.host.focused || this.mouse_row !== undefined;

		if (rows !== 0 && active) {
			key.prevent_default();
			this.dispatchWheel(rows);
		}
	}

	private releaseKey(key: Key): void {
		this.dispatchEvent(new CustomEvent<Key>("keyup", {
			detail: key,
		}));
	}

	private dispatchWheel(rows: number): void {
		this.dispatchEvent(new CustomEvent("wheel", {
			detail: { rows },
		}));
	}
}

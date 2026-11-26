import { WebCanvasHost, type CanvasHost } from "./canvas_host.ts";
import { Colour, DEFAULT_COLOURS, Palette } from "./colour.ts";
import { pointerCell, scrollRowsForKey, wheelRows, type Key, type WheelMode } from "./input.ts";
import { loadModernDosTexture } from "./moderndos.ts";

/**
 * Options for constructing a {@link Canvas}.
 *
 * @example
 * ```ts
 * const canvas = Canvas.from(element, {
 *   palette: new Palette([[0xff, 0x00, 0x00]]),
 *   stretch: true,
 * });
 * ```
 */
export type CanvasOptions = {
	/** Initial 18-colour palette; missing entries use the built-in defaults. */
	palette?: Palette;

	/**
	 * Stretch cells to fill the canvas, allowing fractional cell sizes.
	 * Defaults to false, which uses integer multiples of 8x16 device pixels
	 * and leaves any extra space on the right and bottom. Canvases smaller
	 * than one 8x16 cell always use the full-canvas grid.
	 */
	stretch?: boolean;
};

/**
 * A WebGL2 canvas presented as a grid of character cells.
 *
 * `"resize"` fires when the row or column count changes. `"wheel"` carries
 * a signed whole-row delta in `detail.rows`. `"keydown"` and `"keyup"`
 * carry a {@link Key} in `detail`; they only fire while the host is
 * focused, so keys aimed at other elements are never delivered here.
 * While attached, the canvas consumes Ctrl/Cmd+A and Ctrl/Cmd+C so the
 * page DOM beneath cannot be selected or copied.
 *
 * Use {@link Canvas.from} in a browser or supply a {@link CanvasHost}
 * and a WebGL2 context.
 *
 * @example
 * ```ts
 * const canvas = Canvas.from(document.querySelector("canvas")!);
 * const terminal = new Terminal(canvas);
 * ```
 */
export class Canvas extends EventTarget {
	/** Base cell width in CSS pixels. See {@link actual_cell_width}. */
	static readonly CELL_WIDTH = 8;
	/** Base cell height in CSS pixels. See {@link actual_cell_height}. */
	static readonly CELL_HEIGHT = 16;

	/** The browser surface this canvas reads input and size from. */
	readonly host: CanvasHost;
	/** The WebGL2 rendering context this canvas draws through. */
	readonly gl: WebGL2RenderingContext;

	private readonly unsubscribers: (() => void)[] = [];
	private readonly stretch: boolean;

	private wheel_px: number;
	private grid_width = 0;
	private grid_height = 0;

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

	/** Cell row the pointer is over, or `undefined` outside the grid. */
	mouse_row: number | undefined = undefined;
	/** Cell column the pointer is over, or `undefined` outside the grid. */
	mouse_col: number | undefined = undefined;

	/** `true` while a pointer button is held down on the canvas. */
	mouse_down = false;
	/**
	 * Set on pointer release. Reset it after processing the click in a frame.
	 */
	mouse_click = false;
	/** Cell row where the current press started, or `undefined`. */
	mouse_down_row: number | undefined = undefined;
	/** Cell column where the current press started, or `undefined`. */
	mouse_down_col: number | undefined = undefined;

	/**
	 * The active 18-colour palette as normalised `[R, G, B]` floats
	 * (divided by `0xff`). Use {@link setPalette} to change it.
	 */
	readonly palette: Float32Array;

	/**
	 * The built-in 8x16 bitmap font as a WebGL2 integer texture.
	 * This is the Modern DOS CP437 font baked into tscon.
	 */
	bitmap_font: WebGLTexture;

	/**
	 * Optional 32x8 glyph atlas with equal-sized cells and red-channel coverage.
	 * Enable it per presenter with {@link Terminal.use_user_font} or
	 * {@link Renderer.use_user_font}. Codes 176-223 use {@link bitmap_font}.
	 * Use {@link renderCp437} to generate an atlas.
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
	 * @example
	 * ```ts
	 * const host = new TestCanvasHost({ css_width: 800, css_height: 480 });
	 * const canvas = new Canvas(host, createHeadlessGL2());
	 * ```
	 *
	 * @param host     Browser or test surface to read from.
	 * @param gl       WebGL2 context to draw through.
	 * @param options  Initial palette and other canvas options.
	 */
	constructor(
		host: CanvasHost,
		gl: WebGL2RenderingContext,
		options: CanvasOptions = {},
	) {
		super();
		this.host = host;
		this.gl = gl;
		this.stretch = options.stretch ?? false;
		this.wheel_px = 0;
		this.palette = (options.palette ?? new Palette(DEFAULT_COLOURS)).toFloats();
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
	 * Uses {@link WebCanvasHost} to follow the element's CSS size and input.
	 *
	 * @example
	 * ```ts
	 * const canvas = Canvas.from(document.querySelector("canvas")!);
	 * ```
	 *
	 * @param element  The `<canvas>` element to render into.
	 * @param options  Initial palette and other canvas options.
	 * @returns        A canvas backed by the element.
	 * @throws         When a WebGL2 context cannot be acquired.
	 */
	static from(element: HTMLCanvasElement, options: CanvasOptions = {}): Canvas {
		const host = new WebCanvasHost(element);
		const gl = element.getContext("webgl2");

		if (!gl) {
			host.dispose();
			throw new Error("No WebGL2 context");
		}

		return new Canvas(host, gl, options);
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
	 * Replace the terminal palette.
	 *
	 * Existing references to {@link palette} stay valid. See
	 * {@link Palette.toFloats} for channel conversion and fallback rules.
	 *
	 * @example
	 * ```ts
	 * canvas.setPalette(new Palette([[0xff, 0x00, 0x00]]));
	 * ```
	 *
	 * @param palette  The new palette to apply.
	 */
	setPalette(palette: Palette): void {
		this.palette.set(palette.toFloats());
	}

	/**
	 * Clear rendered pixels to {@link Colour.BG} and reset {@link class_name}.
	 *
	 * Call before drawing a frame. Use {@link Terminal.clear} to reset cells.
	 *
	 * @example
	 * ```ts
	 * canvas.clear();
	 * terminal.clear();
	 * ```
	 */
	clear(): void {
		const gl = this.gl;
		const offset = Colour.BG * 3;

		gl.clearColor(
			this.palette[offset],
			this.palette[offset + 1],
			this.palette[offset + 2],
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

		this.width = this.stretch ? host.pixel_width : Math.floor(host.pixel_width);
		this.height = this.stretch ? host.pixel_height : Math.floor(host.pixel_height);

		const max_pixel_scale = Math.floor(
			Math.min(this.width / Canvas.CELL_WIDTH, this.height / Canvas.CELL_HEIGHT),
		);
		const snap_grid = !this.stretch && max_pixel_scale >= 1;
		const scale = snap_grid
			? Math.min(max_pixel_scale, Math.max(1, Math.round(host.dpr)))
			: Math.max(0.5, host.dpr);
		const cell_height = Canvas.CELL_HEIGHT * scale;
		const cell_width = Canvas.CELL_WIDTH * scale;
		const round_cells = snap_grid ? Math.floor : Math.round;
		const rows = Math.min(256, Math.max(1, round_cells(this.height / cell_height)));
		const cols = Math.min(1024, Math.max(1, round_cells(this.width / cell_width)));

		this.grid_height = snap_grid ? rows * cell_height : this.height;
		this.grid_width = snap_grid ? cols * cell_width : this.width;
		this.actual_cell_height = this.grid_height / rows;
		this.actual_cell_width = this.grid_width / cols;
		gl.viewport(0, this.height - this.grid_height, this.grid_width, this.grid_height);

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
			this.host.css_width * (this.grid_width / (this.width || 1)),
			this.host.css_height * (this.grid_height / (this.height || 1)),
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
		const cell_height = this.host.css_height *
			(this.actual_cell_height / (this.height || 1));

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
		if (this.host.focused) {
			this.dispatchEvent(new CustomEvent<Key>("keydown", {
				detail: key,
			}));
		}

		// Ctrl/Cmd+A and Ctrl/Cmd+C act on the page DOM, not the canvas.
		const name = key.key.toLowerCase();
		const selection_shortcut = (name === "a" || name === "c")
			&& (key.ctrl || key.meta)
			&& !key.alt
			&& !key.shift;

		if (selection_shortcut) {
			key.prevent_default();
		}

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
		if (this.host.focused) {
			this.dispatchEvent(new CustomEvent<Key>("keyup", {
				detail: key,
			}));
		}
	}

	private dispatchWheel(rows: number): void {
		this.dispatchEvent(new CustomEvent("wheel", {
			detail: { rows },
		}));
	}
}

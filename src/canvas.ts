import { loadModernDosTexture } from "./moderndos.ts";
import { PALETTE } from "./colour.ts";

enum DeltaMode {
	PX = 0,
	ROW = 1,
	PAGE = 2,
}

export class Canvas extends EventTarget {
	// cell size in px at 100% zoom and DPR 1
	static readonly CELL_WIDTH = 8;
	static readonly CELL_HEIGHT = 16;

	// mouse wheel tracking fields
	private mouse_wheel_px: number;

	// keyboard scroll tracking fields (for i/j, dn/up)
	private scroll_keys_held: Set<string>;
	private scroll_delay: ReturnType<typeof setTimeout> | undefined;
	private scroll_timer: ReturnType<typeof setInterval> | undefined;

	public element: HTMLCanvasElement;
	public gl: WebGL2RenderingContext;

	// actual width/height in device pixels
	public height!: number;
	public width!: number;

	public rows!: number;
	public cols!: number;

	public actual_cell_height!: number;
	public actual_cell_width!: number;

	// to be set by a component which "claims" the mouse
	public mouse_owner: string;

	public mouse_row: number | undefined;
	public mouse_col: number | undefined;

	public mouse_down: boolean;
	public mouse_click: boolean;
	public mouse_down_row: number | undefined;
	public mouse_down_col: number | undefined;

	public palette: Float32Array;

	public bitmap_font: WebGLTexture;

	public class_name: string;

	constructor(element: HTMLCanvasElement) {
		super();
		this.element = element;

		const gl = element.getContext("webgl2");

		if (!gl) {
			throw new Error("No WebGL context");
			return;
		}

		this.gl = gl;

		this.mouse_wheel_px = 0;

		this.scroll_keys_held = new Set();
		this.scroll_delay = undefined;
		this.scroll_timer = undefined;

		this.mouse_owner = "";

		this.mouse_down = false;
		this.mouse_click = false;

		this.palette = new Float32Array(PALETTE.map((byte) => byte / 0xff));

		this.bitmap_font = loadModernDosTexture(gl);

		this.class_name = "";

		this.resize();

		// add event listeners

		window.addEventListener("resize", () => {
			this.resize();
		});

		window.addEventListener("pointermove", (e: PointerEvent) => {
			this.mouseMove(e.clientX, e.clientY);
		});

		this.element.addEventListener("pointerdown", (e: PointerEvent) => {
			e.preventDefault();

			this.mouseMove(e.clientX, e.clientY);

			this.mouse_down = true;
			this.mouse_down_row = this.mouse_row;
			this.mouse_down_col = this.mouse_col;

			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		});

		this.element.addEventListener("pointerup", () => {
			this.mouse_down = false;
			this.mouse_click = true;
		});

		this.element.addEventListener("pointercancel", () => {
			this.mouse_down = false;
		});

		this.element.addEventListener("pointerleave", () => {
			this.mouse_down = false;
		});

		this.element.addEventListener(
			"wheel",
			(e: WheelEvent) => {
				e.preventDefault();
				this.mouseScroll(e.deltaMode, e.deltaY);
			},
			{ passive: false },
		);

		this.element.addEventListener("contextmenu", (e: MouseEvent) => {
			e.preventDefault();
		});

		window.addEventListener("keydown", (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" || target.tagName === "TEXTAREA" ||
					target.isContentEditable)
			) {
				return;
			}

			if (this.scrollDeltaForKey(e.key) === 0) {
				return;
			}

			// stop the page from scrolling when using arrow keys
			e.preventDefault();

			if (e.repeat) {
				return;
			}

			this.startKeyScroll(e.key);
		});

		window.addEventListener("keyup", (e: KeyboardEvent) => {
			if (this.scrollDeltaForKey(e.key) === 0) {
				return;
			}

			this.stopKeyScroll(e.key);
		});

		window.addEventListener("blur", () => {
			this.scroll_keys_held.clear();

			if (this.scroll_delay !== undefined) {
				clearTimeout(this.scroll_delay);
				this.scroll_delay = undefined;
			}
			if (this.scroll_timer !== undefined) {
				clearInterval(this.scroll_timer);
				this.scroll_timer = undefined;
			}

			this.mouse_down = false;
			this.mouse_click = false;
		});
	}

	private resize() {
		const dpr = window.devicePixelRatio || 1;

		this.height = this.element.clientHeight * dpr;
		this.width = this.element.clientWidth * dpr;
		this.element.height = this.height;
		this.element.width = this.width;

		// update viewport
		this.gl.viewport(0, 0, this.width, this.height);

		const target_cell_height = Math.max(
			Canvas.CELL_HEIGHT / 2,
			Canvas.CELL_HEIGHT * dpr,
		);
		const target_cell_width = Math.max(
			Canvas.CELL_WIDTH / 2,
			Canvas.CELL_WIDTH * dpr,
		);

		const rows = Math.round(
			Math.min(Math.max(1, this.height / target_cell_height), 256),
		);
		const cols = Math.round(
			Math.min(Math.max(1, this.width / target_cell_width), 1024),
		);

		this.actual_cell_height = this.height / rows;
		this.actual_cell_width = this.width / cols;

		// reset mouse related fields
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

	private mouseMove(client_x: number, client_y: number) {
		const dpr = window.devicePixelRatio || 1;

		const actual_client_y = client_y * dpr;
		const actual_client_x = client_x * dpr;

		this.mouse_row = Math.floor(actual_client_y / this.actual_cell_height);
		this.mouse_col = Math.floor(actual_client_x / this.actual_cell_width);
	}

	private mouseScroll(delta_mode: DeltaMode, delta: number) {
		let rows = 0;

		switch (delta_mode) {
			case DeltaMode.PX:
				this.mouse_wheel_px += delta;

				if (Math.abs(this.mouse_wheel_px) >= this.actual_cell_height) {
					rows = Math.floor(this.mouse_wheel_px / this.actual_cell_height);

					this.mouse_wheel_px %= this.actual_cell_height;
				}

				break;

			case DeltaMode.ROW:
				rows = delta;

				break;

			case DeltaMode.PAGE:
				rows = delta * this.rows;

				break;
		}

		this.dispatchEvent(new CustomEvent("wheel", { detail: { rows } }));
	}

	private scrollDeltaForKey(key: string): number {
		switch (key) {
			case "j":
			case "ArrowDown":
				return 1;
			case "k":
			case "ArrowUp":
				return -1;
			case "0":
				return -999999; // full 'scend to top
			default:
				return 0;
		}
	}

	private startKeyScroll(key: string) {
		if (this.scroll_keys_held.has(key)) {
			return;
		}

		this.scroll_keys_held.add(key);

		// immediate first scroll for responsiveness
		this.mouseScroll(DeltaMode.ROW, this.scrollDeltaForKey(key));

		// key repeats after held for a full second
		if (this.scroll_delay === undefined && this.scroll_timer === undefined) {
			this.scroll_delay = setTimeout(() => {
				this.scroll_delay = undefined;
				this.scroll_timer = setInterval(() => {
					let delta = 0;
					for (const k of this.scroll_keys_held) {
						delta += this.scrollDeltaForKey(k);
					}

					if (delta !== 0) {
						this.mouseScroll(DeltaMode.ROW, delta);
					}
				}, 50); // repeat every 50ms
			}, 333); // wait 333ms
		}
	}

	private stopKeyScroll(key: string) {
		this.scroll_keys_held.delete(key);

		if (this.scroll_keys_held.size === 0) {
			if (this.scroll_delay !== undefined) {
				clearTimeout(this.scroll_delay);
				this.scroll_delay = undefined;
			}

			if (this.scroll_timer !== undefined) {
				clearInterval(this.scroll_timer);
				this.scroll_timer = undefined;
			}
		}
	}

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

	mouseDownAt(row: number, col: number, rows: number, cols: number): boolean {
		return (
			this.mouse_down_row !== undefined &&
			this.mouse_down_col !== undefined &&
			this.mouse_down_row >= row &&
			this.mouse_down_row < row + rows &&
			this.mouse_down_col >= col &&
			this.mouse_down_col < col + cols
		);
	}

	clear() {
		const gl = this.gl;

		// clear the canvas
		gl.clearColor(this.palette[0], this.palette[1], this.palette[2], 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		this.class_name = "";
	}
}

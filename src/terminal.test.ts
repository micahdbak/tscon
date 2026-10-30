import { describe, expect, test } from "bun:test";

import { Canvas } from "./canvas.ts";
import { TestCanvasHost } from "./canvas_host.ts";
import { Glyphs } from "./glyphs.ts";
import { HeadlessGL2 } from "./headless_gl.ts";
import { Terminal } from "./terminal.ts";

class CellGL extends HeadlessGL2 {
	cells: Uint16Array | null = null;

	override bufferData(
		target: number,
		data: ArrayBufferView | ArrayBuffer | null,
		usage: number,
	): void {
		if (data instanceof Uint16Array) {
			this.cells = data.slice();
		}

		super.bufferData(target, data, usage);
	}
}

function harness(rows = 3, col_count = 8) {
	const host = new TestCanvasHost({
		css_width: col_count * Canvas.CELL_WIDTH,
		css_height: rows * Canvas.CELL_HEIGHT,
	});
	const gl = new CellGL();
	const canvas = new Canvas(host, gl as unknown as WebGL2RenderingContext);

	return { host, gl, canvas, terminal: new Terminal(canvas) };
}

function cell(gl: CellGL, canvas: Canvas, row: number, col: number): number {
	return gl.cells?.[row * canvas.cols + col] ?? 0;
}

describe("Terminal", () => {
	test("blits glyphs into the framebuffer and uploads them on draw", () => {
		const { gl, canvas, terminal } = harness();
		const glyphs = new Glyphs("abc", 3);

		terminal.clear();
		terminal.blit(
			glyphs,
			{ row: 0, col: 0, rows: 1, cols: 3 },
			{ row: 1, col: 2, rows: 1, cols: 3 },
		);
		terminal.draw();

		expect(gl.cells).toHaveLength(canvas.rows * canvas.cols);
		expect(cell(gl, canvas, 1, 2)).toBe(glyphs.data[0]);
		expect(cell(gl, canvas, 0, 0)).toBe(0);
	});

	test("clips blits that cross the framebuffer edge", () => {
		const { gl, canvas, terminal } = harness(2, 8);
		const glyphs = new Glyphs("ab\ncd", 2);

		terminal.clear();
		terminal.blit(
			glyphs,
			{ row: 0, col: 0, rows: 2, cols: 2 },
			{ row: -1, col: 7, rows: 2, cols: 2 },
		);
		terminal.draw();

		// the second source row is clipped to its first column on row 0
		expect(cell(gl, canvas, 0, 7)).toBe(glyphs.data[2]);
	});

	test("draws detail text on the bottom row and clear removes it", () => {
		const { gl, canvas, terminal } = harness();

		terminal.clear();
		terminal.detail_text = " hi ";
		terminal.draw();

		expect(cell(gl, canvas, canvas.rows - 1, 1) & 0xff).toBe("h".charCodeAt(0));

		terminal.clear();

		expect(terminal.detail_text).toBe("");

		terminal.draw();

		expect(gl.cells?.every((value) => value === 0)).toBe(true);
	});

	test("reallocates the framebuffer after a resize", () => {
		const { host, gl, canvas, terminal } = harness();

		host.resize(2 * Canvas.CELL_WIDTH, 4 * Canvas.CELL_HEIGHT);
		terminal.clear();
		terminal.draw();

		expect(canvas.rows).toBe(4);
		expect(canvas.cols).toBe(2);
		expect(gl.cells).toHaveLength(4 * 2);
	});
});

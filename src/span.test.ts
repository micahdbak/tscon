import { describe, expect, test } from "bun:test";

import { Canvas } from "./canvas.ts";
import { TestCanvasHost } from "./canvas_host.ts";
import { packCell, unpackCell } from "./cell.ts";
import { Glyphs } from "./glyphs.ts";
import { HeadlessGL2 } from "./headless_gl.ts";
import { Spans } from "./span.ts";
import { Terminal } from "./terminal.ts";

class CellGL extends HeadlessGL2 {
	cells: Uint32Array | null = null;

	override bufferData(
		target: number,
		data: ArrayBufferView | ArrayBuffer | null,
		usage: number,
	): void {
		if (data instanceof Uint32Array) {
			this.cells = data.slice();
		}

		super.bufferData(target, data, usage);
	}
}

function harness(rows = 2, cols = 8) {
	const host = new TestCanvasHost({
		css_width: cols * Canvas.CELL_WIDTH,
		css_height: rows * Canvas.CELL_HEIGHT,
	});
	const gl = new CellGL();
	const canvas = new Canvas(host, gl as unknown as WebGL2RenderingContext);

	return { canvas, gl, terminal: new Terminal(canvas) };
}

function cell(gl: CellGL, canvas: Canvas, row: number, col: number): number {
	return gl.cells?.[row * canvas.cols + col] ?? 0;
}

describe("Spans", () => {
	test("contains checks row runs with an exclusive end", () => {
		const spans = new Glyphs("aaaa bbbb", 5).spansFor(2, 6);

		expect([...spans]).toEqual([
			{ row: 0, from: 2, to: 4 },
			{ row: 1, from: 0, to: 1 },
		]);

		for (const [row, col, inside] of [
			[0, 1, false],
			[0, 2, true],
			[0, 3, true],
			[0, 4, false],
			[1, 0, true],
			[1, 1, false],
			[2, 0, false],
		] as [number, number, boolean][]) {
			expect(spans.contains(row, col)).toBe(inside);
		}
	});

	test("equals compares geometry only", () => {
		const first = new Glyphs("abcd", 4).spansFor(1, 3);
		const second = new Glyphs("wxyz", 4).spansFor(1, 3);
		const different = new Glyphs("abcd", 4).spansFor(0, 3);

		expect(first.equals(second)).toBe(true);
		expect(first.equals(different)).toBe(false);
	});

	test("mapCells changes only selected cells", () => {
		const glyphs = new Glyphs("abcd", 4);
		const decorated = glyphs.spansFor(1, 3).mapCells((cell) => {
			const glyph = unpackCell(cell);

			return packCell(glyph.char_code + 1, glyph.foreground, glyph.background);
		});

		expect([...decorated]).toEqual([{ row: 0, from: 1, to: 3 }]);

		const text = [...decorated.glyphs.data].map((value) => {
			return String.fromCharCode(unpackCell(value).char_code);
		});

		expect(text.slice(0, 4)).toEqual(["a", "c", "d", "d"]);
		expect(String.fromCharCode(unpackCell(glyphs.data[1]!).char_code)).toBe("b");
	});

	test("blit copies runs at an origin and clips the destination", () => {
		const { canvas, gl, terminal } = harness();
		const glyphs = new Glyphs("abcd\nefgh", 4);
		const spans = new Spans(glyphs, [
			{ row: 0, from: 1, to: 3 },
			{ row: 1, from: 0, to: 2 },
		]);

		terminal.clear();
		spans.blit(
			terminal,
			{ row: 0, col: 2 },
			{ row: 0, col: 0, rows: 1, cols: 5 },
		);
		terminal.draw();

		expect(cell(gl, canvas, 0, 2)).toBe(0);
		expect(cell(gl, canvas, 0, 3)).toBe(glyphs.data[1]);
		expect(cell(gl, canvas, 0, 4)).toBe(glyphs.data[2]);
		expect(cell(gl, canvas, 0, 5)).toBe(0);
		expect(cell(gl, canvas, 1, 2)).toBe(0);
	});
});

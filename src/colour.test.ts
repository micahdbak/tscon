import { describe, expect, test } from "bun:test";

import { Canvas } from "./canvas.ts";
import { TestCanvasHost } from "./canvas_host.ts";
import { Glyphs } from "./glyphs.ts";
import { DEFAULT_COLOURS, Palette } from "./colour.ts";
import { HeadlessGL2 } from "./headless_gl.ts";
import { Renderer } from "./renderer.ts";
import { Terminal } from "./terminal.ts";
import { TexGlyphMode, textureGlyphs } from "./tex_glyphs.ts";

class PaletteGL extends HeadlessGL2 {
	readonly palette_updates: Float32Array[] = [];

	override uniform3fv(
		location: WebGLUniformLocation | null,
		value: Float32List,
	): void {
		this.palette_updates.push(new Float32Array(value));
		super.uniform3fv(location, value);
	}
}

function harness() {
	const host = new TestCanvasHost({ css_width: 800, css_height: 480 });
	const gl = new PaletteGL();
	const canvas = new Canvas(host, gl as unknown as WebGL2RenderingContext, {
		palette: new Palette([[10, 20, 30]]),
	});
	const terminal = new Terminal(canvas);
	const renderer = new Renderer(canvas);

	return { gl, canvas, terminal, renderer };
}

function lastPalette(gl: PaletteGL): number[] {
	return Array.from(gl.palette_updates[gl.palette_updates.length - 1]!);
}

describe("colour palette", () => {
	test("DEFAULT_COLOURS has 16 colours", () => {
		expect(DEFAULT_COLOURS).toHaveLength(16);
	});

	test("Palette copies colours and clamps them when converting", () => {
		const palette = new Palette([
			[255, 0, 0],
			[0, 256, -1],
			[128.6, 0, 0],
		]);
		const floats = palette.toFloats();

		expect(floats).toHaveLength(48);
		expect(floats[0]).toBe(1);
		expect(floats[1]).toBe(0);
		expect(floats[2]).toBe(0);
		expect(floats[3]).toBe(0);
		expect(floats[4]).toBe(1);
		expect(floats[5]).toBe(0);
		expect(floats[6]).toBeCloseTo(129 / 255);
		expect(floats[9]).toBeCloseTo(DEFAULT_COLOURS[3]![0] / 0xff);
		expect(palette.toFloats()).not.toBe(floats);
	});

	test("Terminal.draw uses the current palette", () => {
		const { gl, canvas, terminal } = harness();
		const glyphs = new Glyphs("x", 1);

		terminal.clear();
		terminal.blit(
			glyphs,
			{ row: 0, col: 0, rows: 1, cols: 1 },
			{ row: 0, col: 0, rows: 1, cols: 1 },
		);
		terminal.draw();

		expect(lastPalette(gl)).toEqual(Array.from(canvas.palette));

		canvas.setPalette(new Palette([[200, 100, 50]]));
		terminal.draw();

		expect(lastPalette(gl)).toEqual(Array.from(canvas.palette));
	});

	test("Renderer.draw uses the current palette", () => {
		const { gl, canvas, renderer } = harness();
		const glyphs = textureGlyphs(1, 1, TexGlyphMode.SAMPLE);

		renderer.draw(
			glyphs,
			{} as WebGLTexture,
			{ row: 0, col: 0, rows: 1, cols: 1 },
		);

		expect(lastPalette(gl)).toEqual(Array.from(canvas.palette));

		canvas.setPalette(new Palette([[1, 2, 3]]));
		renderer.draw(
			glyphs,
			{} as WebGLTexture,
			{ row: 0, col: 0, rows: 1, cols: 1 },
		);

		expect(lastPalette(gl)).toEqual(Array.from(canvas.palette));
	});
});

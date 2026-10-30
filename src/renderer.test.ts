import { describe, expect, test } from "bun:test";

import { Canvas } from "./canvas.ts";
import { TestCanvasHost } from "./canvas_host.ts";
import { HeadlessGL2 } from "./headless_gl.ts";
import { Renderer } from "./renderer.ts";
import { TexGlyphMode, textureGlyphs } from "./tex_glyphs.ts";

class DrawGL extends HeadlessGL2 {
	readonly draw_calls: number[] = [];

	override drawArraysInstanced(
		mode: number,
		first: number,
		count: number,
		instance_count: number,
	): void {
		this.draw_calls.push(instance_count);
		super.drawArraysInstanced(mode, first, count, instance_count);
	}
}

function harness() {
	const host = new TestCanvasHost({ css_width: 800, css_height: 480 });
	const gl = new DrawGL();
	const canvas = new Canvas(host, gl as unknown as WebGL2RenderingContext);

	return { gl, renderer: new Renderer(canvas) };
}

describe("Renderer", () => {
	test("draws a texture-glyph grid as one instanced draw", () => {
		const { gl, renderer } = harness();
		const glyphs = textureGlyphs(2, 3, TexGlyphMode.SAMPLE);

		renderer.draw(
			glyphs,
			{} as WebGLTexture,
			{ row: 0, col: 0, rows: 2, cols: 3 },
		);

		expect(gl.draw_calls).toEqual([6]);
	});

	test("skips draws whose destination size does not match", () => {
		const { gl, renderer } = harness();
		const glyphs = textureGlyphs(2, 3, TexGlyphMode.SAMPLE);
		const log = console.log;

		console.log = () => {};

		try {
			renderer.draw(
				glyphs,
				{} as WebGLTexture,
				{ row: 0, col: 0, rows: 1, cols: 3 },
			);
		} finally {
			console.log = log;
		}

		expect(gl.draw_calls).toEqual([]);
	});
});

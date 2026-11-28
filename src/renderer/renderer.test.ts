import { describe, expect, test } from "bun:test";
import { Canvas } from "../canvas/canvas.ts";
import { TestCanvasHost } from "../canvas/canvas_host.ts";
import { createHeadlessGL2, HeadlessGL2 } from "../headless_gl.ts";
import { Terminal } from "../terminal/terminal.ts";
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
	test("updates font selection each draw in both glyph renderers", () => {
		const host = new TestCanvasHost({ css_width: 80, css_height: 160 });
		const gl = createHeadlessGL2();
		const font_uniform = {} as WebGLUniformLocation;
		const font_values: number[] = [];
		const get_location = gl.getUniformLocation.bind(gl);
		gl.getUniformLocation = (program, name) => {
			return name === "u_use_user_font" ? font_uniform : get_location(program, name);
		};
		gl.uniform1i = (location, value) => {
			if (location === font_uniform) {
				font_values.push(value);
			}
		};

		const canvas = new Canvas(host, gl);
		const terminal = new Terminal(canvas);
		const renderer = new Renderer(canvas);
		const glyphs = textureGlyphs(1, 1, TexGlyphMode.GLYPHS);
		const texture = {} as WebGLTexture;
		const dst = { row: 0, col: 0, rows: 1, cols: 1 };

		for (const [enabled, font, expected] of [
			[true, texture, 1],
			[false, texture, 0],
			[true, null, 0],
		] as const) {
			canvas.user_font = font;
			terminal.use_user_font = enabled;
			renderer.use_user_font = enabled;
			terminal.draw();
			renderer.draw(glyphs, texture, dst);
			expect(font_values.splice(0)).toEqual([expected, expected]);
		}

		canvas.user_font = texture;
		terminal.draw();
		renderer.draw(glyphs, texture, dst);
		expect(font_values).toEqual([1, 1]);
	});

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

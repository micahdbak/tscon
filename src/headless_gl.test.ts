import { describe, expect, test } from "bun:test";

import { Canvas } from "./canvas.ts";
import { TestCanvasHost } from "./canvas_host.ts";
import { Glyphs } from "./glyphs.ts";
import { createHeadlessGL2, HeadlessGL2 } from "./headless_gl.ts";
import { compileProgram, getAttribLocations, getUniformLocations } from "./program.ts";
import { Renderer } from "./renderer.ts";
import { Terminal } from "./terminal.ts";
import { TexGlyphMode, textureGlyphs } from "./tex_glyphs.ts";

function engine() {
	const gl = createHeadlessGL2();
	const host = new TestCanvasHost({ css_width: 800, css_height: 480 });
	const canvas = new Canvas(host, gl);

	return {
		gl,
		host,
		canvas,
		terminal: new Terminal(canvas),
		renderer: new Renderer(canvas),
	};
}

describe("HeadlessGL2", () => {
	test("reports success for shader compilation and program linking", () => {
		const gl = createHeadlessGL2();
		const program = compileProgram(gl, "vertex", "fragment");

		expect(program).toBeTruthy();
		expect(gl.getError()).toBe(0);
	});

	test("returns usable attribute and uniform locations", () => {
		const gl = createHeadlessGL2();
		const program = compileProgram(gl, "vertex", "fragment");

		expect(getAttribLocations(gl, program, { position: "a_position" })).toEqual({
			position: 0,
		});

		expect(getUniformLocations(gl, program, { colour: "u_colour" })).toEqual({
			colour: {} as WebGLUniformLocation,
		});
	});

	test("constructs and draws Terminal and Renderer", () => {
		const { canvas, terminal, renderer } = engine();
		const glyphs = new Glyphs("hello", 5);

		canvas.clear();
		terminal.clear();
		terminal.detail_text = " detail ";
		terminal.blit(
			glyphs,
			{ row: 0, col: 0, rows: 1, cols: 5 },
			{ row: 1, col: 2, rows: 1, cols: 5 },
		);
		terminal.draw();

		const texture = textureGlyphs(2, 3, TexGlyphMode.SAMPLE);

		renderer.draw(
			texture,
			{} as WebGLTexture,
			{ row: 0, col: 0, rows: 2, cols: 3 },
		);

		expect(true).toBe(true);
	});

	test("the class is a WebGL2-shaped no-op context", () => {
		const context = new HeadlessGL2();

		expect(context.isContextLost()).toBe(false);
		expect(context.checkFramebufferStatus(context.FRAMEBUFFER)).toBe(
			context.FRAMEBUFFER_COMPLETE,
		);
		expect(context.getSupportedExtensions()).toEqual([]);
		expect(context.getExtension("test")).toBeNull();
	});
});

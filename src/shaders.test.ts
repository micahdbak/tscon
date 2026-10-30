import { describe, expect, test } from "bun:test";

import {
	glyph_frag,
	renderer_frag,
	renderer_vert,
	terminal_frag,
	terminal_vert,
} from "./shaders.ts";

const full_shaders = {
	renderer_frag,
	renderer_vert,
	terminal_frag,
	terminal_vert,
};

describe("generated shaders", () => {
	test("every full shader is a WebGL2 GLSL source", () => {
		for (const source of Object.values(full_shaders)) {
			expect(source).toContain("#version 300 es");
			expect(source).toContain("void main()");
		}
	});

	test("the shared glyph fragment provides its helper functions", () => {
		expect(glyph_frag).toContain("bitmap_glyph_value");
	});

	test("the text shaders contain no mouse cursor uniforms", () => {
		expect(terminal_vert).not.toContain("u_mouse");
		expect(renderer_vert).not.toContain("u_mouse");
		expect(renderer_frag).not.toContain("f_is_cursor");
	});
});

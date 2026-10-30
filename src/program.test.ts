import { describe, expect, test } from "bun:test";

import { HeadlessGL2 } from "./headless_gl.ts";
import { compileProgram, getAttribLocations, getUniformLocations } from "./program.ts";

class RejectShaderGL extends HeadlessGL2 {
	override getShaderParameter(): boolean {
		return false;
	}
}

class RejectProgramGL extends HeadlessGL2 {
	override getProgramParameter(): boolean {
		return false;
	}
}

class BadAttribGL extends HeadlessGL2 {
	override getAttribLocation(): number {
		return -1;
	}
}

class BadUniformGL extends HeadlessGL2 {
	override getUniformLocation(): WebGLUniformLocation {
		return null as unknown as WebGLUniformLocation;
	}
}

describe("program helpers", () => {
	test("compileProgram reports shader compilation failures", () => {
		expect(() =>
			compileProgram(
				new RejectShaderGL() as unknown as WebGL2RenderingContext,
				"vertex",
				"fragment",
			),
		).toThrow("When compiling vertex shader");
	});

	test("compileProgram reports program link failures", () => {
		expect(() =>
			compileProgram(
				new RejectProgramGL() as unknown as WebGL2RenderingContext,
				"vertex",
				"fragment",
			),
		).toThrow("When linking shader program");
	});

	test("attribute and uniform lookup report missing locations", () => {
		const program = {} as WebGLProgram;
		const attribute_gl = new BadAttribGL() as unknown as WebGL2RenderingContext;
		const uniform_gl = new BadUniformGL() as unknown as WebGL2RenderingContext;

		expect(() =>
			getAttribLocations(attribute_gl, program, { position: "a_position" }),
		).toThrow("When getting attribute location for a_position");

		expect(() =>
			getUniformLocations(uniform_gl, program, { colour: "u_colour" }),
		).toThrow("When getting uniform location for u_colour");
	});
});

import VERTEX_SHADER from "./shaders/renderer.vert" with { type: "text" };
import FRAGMENT_SHADER from "./shaders/renderer.frag" with { type: "text" };

import { Canvas } from "./canvas.ts";
import { TexGlyphs } from "./glyphs.ts";
import {
	compileProgram,
	getAttribLocations,
	getUniformLocations,
} from "./shader.ts";
import { Rect } from "./rect.ts";

export class Renderer {
	private gl_program: WebGLProgram;

	private attributes: Record<string, number>;
	private uniforms: Record<string, WebGLUniformLocation>;

	private vao: WebGLVertexArrayObject;
	private vbo: WebGLBuffer;

	private resized: boolean;

	public canvas: Canvas;

	constructor(canvas: Canvas) {
		this.canvas = canvas;
		const gl = canvas.gl;

		this.gl_program = compileProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);

		this.attributes = getAttribLocations(gl, this.gl_program, {
			row: "a_row",
			col: "a_col",
			mode: "a_mode",
		});

		this.uniforms = getUniformLocations(gl, this.gl_program, {
			row: "u_row",
			col: "u_col",
			rows: "u_rows",
			cols: "u_cols",
			canvas_rows: "u_canvas_rows",
			canvas_cols: "u_canvas_cols",
			mouse_row: "u_mouse_row",
			mouse_col: "u_mouse_col",
			palette: "u_palette",
			bitmap_font: "u_bitmap_font",
			texture: "u_texture",
		});

		const vao = gl.createVertexArray();
		this.vao = vao;

		if (!vao) {
			throw new Error("Could not create vertex array object");
		}

		gl.bindVertexArray(vao);

		const vbo = gl.createBuffer();
		this.vbo = vbo;

		if (!vbo) {
			throw new Error("Could not create vertex buffer");
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

		// every vertex in the VBO is a 32-bit integer split like so:
		// [ row    | mode   | col     ]
		// [ 8-bits | 8-bits | 16-bits ]

		// a_row
		gl.vertexAttribIPointer(this.attributes.row, 1, gl.UNSIGNED_BYTE, 4, 3);
		gl.vertexAttribDivisor(this.attributes.row, 1);
		gl.enableVertexAttribArray(this.attributes.row);

		// a_mode
		gl.vertexAttribIPointer(this.attributes.mode, 1, gl.UNSIGNED_BYTE, 4, 2);
		gl.vertexAttribDivisor(this.attributes.mode, 1);
		gl.enableVertexAttribArray(this.attributes.mode);

		// a_col
		gl.vertexAttribIPointer(this.attributes.col, 1, gl.UNSIGNED_SHORT, 4, 0);
		gl.vertexAttribDivisor(this.attributes.col, 1);
		gl.enableVertexAttribArray(this.attributes.col);

		gl.bindVertexArray(null);

		gl.useProgram(this.gl_program);
		gl.uniform1i(this.uniforms.row, 0);
		gl.uniform1i(this.uniforms.col, 0);
		gl.uniform1i(this.uniforms.rows, 0);
		gl.uniform1i(this.uniforms.cols, 0);
		gl.uniform1i(this.uniforms.canvas_rows, this.canvas.rows);
		gl.uniform1i(this.uniforms.canvas_cols, this.canvas.cols);
		gl.uniform3fv(this.uniforms.palette, this.canvas.palette);
		gl.uniform1i(this.uniforms.bitmap_font, 0);
		gl.uniform1i(this.uniforms.texture, 1);

		this.resized = false;

		this.canvas.addEventListener("resize", () => {
			this.resized = true;
		});
	}

	draw(tglyphs: TexGlyphs, texture: WebGLTexture, dst: Rect) {
		if (tglyphs.rows !== dst.rows || tglyphs.cols !== dst.cols) {
			console.log("Renderer.draw: skipping due to bad tglyphs or dst");
			return;
		}

		const gl = this.canvas.gl;
		gl.useProgram(this.gl_program);

		if (this.resized) {
			this.resized = false;

			gl.uniform1i(this.uniforms.canvas_rows, this.canvas.rows);
			gl.uniform1i(this.uniforms.canvas_cols, this.canvas.cols);
		}

		// set destination information uniforms
		gl.uniform1i(this.uniforms.row, dst.row);
		gl.uniform1i(this.uniforms.col, dst.col);
		gl.uniform1i(this.uniforms.rows, tglyphs.rows);
		gl.uniform1i(this.uniforms.cols, tglyphs.cols);
		gl.uniform1i(this.uniforms.mouse_row, this.canvas.mouse_row ?? -1);
		gl.uniform1i(this.uniforms.mouse_col, this.canvas.mouse_col ?? -1);

		// set vertex buffer data to provided texture glyphs
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.bufferData(gl.ARRAY_BUFFER, tglyphs.data, gl.DYNAMIC_DRAW);

		// bind and activate bitmap font
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.canvas.bitmap_font);

		// bind and activate provided texture
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, texture);

		// draw the glyphs covered by the provided texture glyphs
		gl.bindVertexArray(this.vao);
		gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, tglyphs.rows * tglyphs.cols);
		gl.bindVertexArray(null);
	}
}

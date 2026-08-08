import VERTEX_SHADER from "./shaders/terminal.vert" with { type: "text" };
import FRAGMENT_SHADER from "./shaders/terminal.frag" with { type: "text" };

import { Canvas } from "./canvas.ts";
import { Glyphs, textGlyphs } from "./glyphs.ts";
import { Rect } from "./rect.ts";

import {
	compileProgram,
	getAttribLocations,
	getUniformLocations,
} from "./shader.ts";

export class Terminal {
	private gl_program: WebGLProgram;

	private attributes: Record<string, number>;
	private uniforms: Record<string, WebGLUniformLocation>;

	private vao: WebGLVertexArrayObject;
	private vbo: WebGLBuffer;

	// framebuffer of console characters
	private fbcon: Uint16Array;

	private resized: boolean;

	private last_detail_text: string;
	private detail_glyphs: Glyphs | null;

	public canvas: Canvas;

	public detail_text: string;

	constructor(canvas: Canvas) {
		this.canvas = canvas;
		const gl = canvas.gl;

		this.fbcon = new Uint16Array(0);
		this.last_detail_text = "";
		this.detail_glyphs = null;
		this.detail_text = "";

		this.gl_program = compileProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);

		this.attributes = getAttribLocations(gl, this.gl_program, {
			colour: "a_colour",
			char_code: "a_char_code",
		});

		this.uniforms = getUniformLocations(gl, this.gl_program, {
			rows: "u_rows",
			cols: "u_cols",
			mouse_row: "u_mouse_row",
			mouse_col: "u_mouse_col",
			palette: "u_palette",
			bitmap_font: "u_bitmap_font",
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

		// every vertex in the VBO is a 16-bit integer split like so:
		// [ a_colour | a_char_code ]
		// [ 8 bits   | 8 bits      ]

		// a_colour
		gl.vertexAttribIPointer(this.attributes.colour, 1, gl.UNSIGNED_BYTE, 2, 1);
		gl.vertexAttribDivisor(this.attributes.colour, 1);
		gl.enableVertexAttribArray(this.attributes.colour);

		// a_char_code
		gl.vertexAttribIPointer(
			this.attributes.char_code,
			1,
			gl.UNSIGNED_BYTE,
			2,
			0,
		);
		gl.vertexAttribDivisor(this.attributes.char_code, 1);
		gl.enableVertexAttribArray(this.attributes.char_code);

		gl.bindVertexArray(null);

		gl.useProgram(this.gl_program);
		gl.uniform1i(this.uniforms.rows, this.canvas.rows);
		gl.uniform1i(this.uniforms.cols, this.canvas.cols);
		gl.uniform1i(this.uniforms.mouse_row, -1);
		gl.uniform1i(this.uniforms.mouse_col, -1);
		gl.uniform3fv(this.uniforms.palette, this.canvas.palette);
		gl.uniform1i(this.uniforms.bitmap_font, 0);

		this.resized = true;

		this.canvas.addEventListener("resize", () => {
			this.resized = true;
		});
	}

	blit(glyphs: Glyphs, src: Rect, dst: Rect) {
		// validate the input rects
		if (src.rows !== dst.rows || src.cols !== dst.cols) {
			console.log("Terminal.blit: not blitting due to bad src or dst");
			return;
		}

		// handle negatives

		if (src.row < 0) {
			const drow = Math.abs(src.row);

			src.row = 0;
			src.rows -= drow;

			dst.row += drow;
			dst.rows -= drow;
		}

		if (src.col < 0) {
			const dcol = Math.abs(src.col);

			src.col = 0;
			src.cols -= dcol;

			dst.col += dcol;
			dst.cols -= dcol;
		}

		if (dst.row < 0) {
			const drow = Math.abs(dst.row);

			src.row += drow;
			src.rows -= drow;

			dst.row = 0;
			dst.rows -= drow;
		}

		if (dst.col < 0) {
			const dcol = Math.abs(dst.col);

			src.col += dcol;
			src.cols -= dcol;

			dst.col = 0;
			dst.cols -= dcol;
		}

		// handle overflow

		if (dst.row + dst.rows > this.canvas.rows) {
			const extra_rows = dst.row + dst.rows - this.canvas.rows;
			dst.rows -= extra_rows;
			src.rows = dst.rows;
		}

		if (dst.col + dst.cols > this.canvas.cols) {
			const extra_cols = dst.col + dst.cols - this.canvas.cols;
			dst.cols -= extra_cols;
			src.cols = dst.cols;
		}

		for (let row = 0;; row++) {
			const src_row = row + src.row;
			const dst_row = row + dst.row;

			if (src_row >= src.row + src.rows || dst_row >= dst.row + dst.rows) {
				break;
			}

			const src_idx = src_row * glyphs.cols + src.col;
			const dst_idx = dst_row * this.canvas.cols + dst.col;

			this.fbcon.set(
				glyphs.data.subarray(src_idx, src_idx + src.cols),
				dst_idx,
			);
		}
	}

	clear() {
		const gl = this.canvas.gl;

		if (this.resized) {
			this.resized = false;

			gl.useProgram(this.gl_program);
			gl.uniform1i(this.uniforms.rows, this.canvas.rows);
			gl.uniform1i(this.uniforms.cols, this.canvas.cols);

			this.fbcon = new Uint16Array(this.canvas.rows * this.canvas.cols);
		}

		this.fbcon.fill(0);

		this.detail_text = "";
	}

	draw() {
		if (this.last_detail_text !== this.detail_text) {
			this.last_detail_text = this.detail_text;

			if (this.detail_text.length > 0) {
				this.detail_glyphs = textGlyphs(
					"\\B0\\F7" + this.detail_text,
					this.detail_text.length,
					false,
				);
			} else {
				this.detail_glyphs = null;
			}
		}

		if (this.detail_text.length > 0 && this.detail_glyphs !== null) {
			this.blit(
				this.detail_glyphs,
				{ row: 0, col: 0, rows: 1, cols: this.detail_glyphs.cols },
				{
					row: this.canvas.rows - 1,
					col: 0,
					rows: 1,
					cols: this.detail_glyphs.cols,
				},
			);
		}

		const gl = this.canvas.gl;
		gl.useProgram(this.gl_program);

		// set mouse position uniforms
		gl.uniform1i(this.uniforms.mouse_row, this.canvas.mouse_row ?? -1);
		gl.uniform1i(this.uniforms.mouse_col, this.canvas.mouse_col ?? -1);

		// upload glyph data to the GPU
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.bufferData(gl.ARRAY_BUFFER, this.fbcon, gl.DYNAMIC_DRAW);

		// bind and activate the bitmap font
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.canvas.bitmap_font);

		// draw glyphs: generate 6 vertices (two triangles = one quad) per glyph instance
		gl.bindVertexArray(this.vao);
		gl.drawArraysInstanced(
			gl.TRIANGLES,
			0,
			6,
			this.canvas.rows * this.canvas.cols,
		);
		gl.bindVertexArray(null);
	}
}

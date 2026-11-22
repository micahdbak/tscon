import { terminal_frag, terminal_vert } from "./shaders.ts";
import { Canvas } from "./canvas.ts";
import { Glyphs } from "./glyphs.ts";
import { Wrap } from "./wrap.ts";
import type { Rect } from "./rect.ts";

import {
	compileProgram,
	getAttribLocations,
	getUniformLocations,
} from "./program.ts";

/**
 * Renders a character grid from glyphs onto a {@link Canvas}.
 *
 * For each frame, call {@link clear}, copy {@link Glyphs} with {@link blit},
 * then call {@link draw}.
 *
 * @example
 * ```ts
 * const terminal = new Terminal(canvas);
 * terminal.clear();
 * terminal.blit(glyphs, region, region);
 * terminal.draw();
 * ```
 */
export class Terminal {
	private readonly gl_program: WebGLProgram;
	private readonly uniforms: Record<string, WebGLUniformLocation>;

	private readonly vao: WebGLVertexArrayObject;
	private readonly vbo: WebGLBuffer;

	private fbcon: Uint32Array;

	private resized: boolean;

	private last_detail_text: string;
	private detail_glyphs: Glyphs | null;

	/** The {@link Canvas} this terminal renders into. */
	public canvas: Canvas;

	/**
	 * Text overlaid on the bottom row during {@link draw}. An empty string
	 * leaves the row as blitted.
	 */
	public detail_text: string;

	/**
	 * Whether to use {@link Canvas.user_font} for non-box glyphs when
	 * available. Set to `true` by the application after assigning a font
	 * texture to `canvas.user_font`; automatically falls back to the bitmap
	 * font if `user_font` is `null`.
	 */
	public use_user_font: boolean;

	/**
	 * Create a terminal that follows the canvas grid size.
	 *
	 * @example
	 * ```ts
	 * const terminal = new Terminal(canvas);
	 * ```
	 *
	 * @param canvas  The canvas to render into.
	 */
	constructor(canvas: Canvas) {
		this.canvas = canvas;
		const gl = canvas.gl;

		this.fbcon = new Uint32Array(0);
		this.last_detail_text = "";
		this.detail_glyphs = null;
		this.detail_text = "";

		this.gl_program = compileProgram(
			gl,
			terminal_vert,
			terminal_frag,
		);

		const attributes = getAttribLocations(gl, this.gl_program, {
			cell: "a_cell",
		});

		this.uniforms = getUniformLocations(gl, this.gl_program, {
			rows: "u_rows",
			cols: "u_cols",
			palette: "u_palette",
			bitmap_font: "u_bitmap_font",
			user_font: "u_user_font",
			use_user_font: "u_use_user_font",
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

		gl.vertexAttribIPointer(attributes.cell, 1, gl.UNSIGNED_INT, 4, 0);
		gl.vertexAttribDivisor(attributes.cell, 1);
		gl.enableVertexAttribArray(attributes.cell);

		gl.bindVertexArray(null);

		gl.useProgram(this.gl_program);
		gl.uniform1i(this.uniforms.rows, this.canvas.rows);
		gl.uniform1i(this.uniforms.cols, this.canvas.cols);
		gl.uniform1i(this.uniforms.bitmap_font, 0);
		gl.uniform1i(this.uniforms.user_font, 1);

		this.resized = true;

		this.use_user_font = false;

		this.canvas.addEventListener("resize", () => {
			this.resized = true;
		});
	}

	/**
	 * Copy a region of a {@link Glyphs} block onto the console framebuffer.
	 *
	 * The rectangles must have equal sizes. The destination clips to the
	 * canvas, and negative origins shift the paired rectangle. Keep the
	 * source's right and bottom edges within the glyph grid. Later blits
	 * replace earlier cells, including when the source cell is zero.
	 * Call {@link draw} to present the result.
	 *
	 * @example
	 * ```ts
	 * terminal.blit(content,
	 *   { row: 0, col: 0, rows: content.rows, cols: content.cols },
	 *   { row: 2, col: 4, rows: content.rows, cols: content.cols });
	 * ```
	 *
	 * @param glyphs  Source glyph grid.
	 * @param src     Region of `glyphs` to copy.
	 * @param dst     Destination region on the console.
	 */
	blit(glyphs: Glyphs, src: Rect, dst: Rect) {
		if (src.rows !== dst.rows || src.cols !== dst.cols) {
			console.log(
				"Terminal.blit: not blitting due to bad src or dst",
			);
			return;
		}

		// Clip copies to keep caller-owned rectangles intact.
		src = { ...src };
		dst = { ...dst };

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

		if (dst.row + dst.rows > this.canvas.rows) {
			const extra_rows = dst.row + dst.rows -
				this.canvas.rows;
			dst.rows -= extra_rows;
			src.rows = dst.rows;
		}

		if (dst.col + dst.cols > this.canvas.cols) {
			const extra_cols = dst.col + dst.cols -
				this.canvas.cols;
			dst.cols -= extra_cols;
			src.cols = dst.cols;
		}

		for (let row = 0;; row++) {
			const src_row = row + src.row;
			const dst_row = row + dst.row;

			if (
				src_row >= src.row + src.rows ||
				dst_row >= dst.row + dst.rows
			) {
				break;
			}

			const src_idx = src_row * glyphs.cols + src.col;
			const dst_idx = dst_row * this.canvas.cols + dst.col;

			this.fbcon.set(
				glyphs.data.subarray(
					src_idx,
					src_idx + src.cols,
				),
				dst_idx,
			);
		}
	}

	/**
	 * Reset the cell buffer and {@link detail_text} before blitting a frame.
	 *
	 * The buffer follows the current canvas grid. Use {@link Canvas.clear}
	 * to clear rendered pixels.
	 *
	 * @example
	 * ```ts
	 * canvas.clear();
	 * terminal.clear();
	 * ```
	 */
	clear() {
		const gl = this.canvas.gl;

		if (this.resized) {
			this.resized = false;

			gl.useProgram(this.gl_program);
			gl.uniform1i(this.uniforms.rows, this.canvas.rows);
			gl.uniform1i(this.uniforms.cols, this.canvas.cols);

			this.fbcon = new Uint32Array(
				this.canvas.rows * this.canvas.cols,
			);
		}

		this.fbcon.fill(0);

		this.detail_text = "";
	}

	/**
	 * Rasterise the console framebuffer to the canvas.
	 *
	 * Call after all {@link blit} calls for the frame. Zero-valued cells leave
	 * the underlying pixels visible.
	 *
	 * @example
	 * ```ts
	 * terminal.blit(glyphs, region, region);
	 * terminal.draw();
	 * ```
	 */
	draw() {
		if (this.last_detail_text !== this.detail_text) {
			this.last_detail_text = this.detail_text;

			if (this.detail_text.length > 0) {
				this.detail_glyphs = new Glyphs(
					"\\B0\\F7" + this.detail_text,
					this.detail_text.length,
					{ wrap: Wrap.TRUNCATE },
				);
			} else {
				this.detail_glyphs = null;
			}
		}

		if (
			this.detail_text.length > 0 &&
			this.detail_glyphs !== null
		) {
			this.blit(
				this.detail_glyphs,
				{
					row: 0,
					col: 0,
					rows: 1,
					cols: this.detail_glyphs.cols,
				},
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
		gl.uniform3fv(this.uniforms.palette, this.canvas.palette);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.bufferData(gl.ARRAY_BUFFER, this.fbcon, gl.DYNAMIC_DRAW);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.canvas.bitmap_font);

		const user_font = this.canvas.user_font;
		const use_user_font = this.use_user_font && user_font !== null;
		gl.uniform1i(this.uniforms.use_user_font, Number(use_user_font));

		if (use_user_font) {
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, user_font);
		}

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

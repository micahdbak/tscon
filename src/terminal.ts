import { terminal_frag, terminal_vert } from "./shaders.ts";
import { Canvas } from "./canvas.ts";
import { Glyphs, textGlyphs } from "./glyphs.ts";
import { Rect } from "./rect.ts";

import {
	compileProgram,
	getAttribLocations,
	getUniformLocations,
} from "./program.ts";

/**
 * Renders a character grid from glyphs onto a {@link Canvas}.
 *
 * `Terminal` owns a `rows` x `cols` framebuffer of packed 16-bit glyph
 * cells (as produced by {@link textGlyphs}) and draws it one instanced
 * quad per cell. A frame is typically: {@link clear}, {@link blit} one or
 * more {@link Glyphs} blocks onto the framebuffer, then {@link draw}.
 *
 * If {@link detail_text} is set, it is rendered onto the last row as a
 * status line each frame.
 */
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

	/** The {@link Canvas} this terminal renders into. */
	public canvas: Canvas;

	/**
	 * Status text shown on the bottom row, or `""` for none.
	 *
	 * When non-empty it is compiled to glyphs (with a bright-on-black
	 * style) and blitted across the last row each {@link draw}. Components
	 * use this to show hover details, link URLs, etc.
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
	 * Initializes the terminal for use.
	 * Listens for `"resize"` events from the canvas.
	 *
	 * @param canvas  The canvas to render into.
	 */
	constructor(canvas: Canvas) {
		this.canvas = canvas;
		const gl = canvas.gl;

		this.fbcon = new Uint16Array(0);
		this.last_detail_text = "";
		this.detail_glyphs = null;
		this.detail_text = "";

		this.gl_program = compileProgram(
			gl,
			terminal_vert,
			terminal_frag,
		);

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

		// every vertex in the VBO is a 16-bit integer split like so:
		// [ a_colour | a_char_code ]
		// [ 8 bits   | 8 bits      ]

		// a_colour
		gl.vertexAttribIPointer(
			this.attributes.colour,
			1,
			gl.UNSIGNED_BYTE,
			2,
			1,
		);
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
		gl.uniform1i(this.uniforms.user_font, 1);
		gl.uniform1i(this.uniforms.use_user_font, 0);

		this.resized = true;

		this.use_user_font = false;

		this.canvas.addEventListener("resize", () => {
			this.resized = true;
		});
	}

	/**
	 * Copy a region of a {@link Glyphs} block onto the console framebuffer.
	 *
	 * `src` selects the region of `glyphs` to copy and `dst` selects where
	 * on the console it goes. `src` and `dst` must be the same size;
	 * otherwise the blit is skipped. Both rectangles are clipped to their
	 * respective bounds, with negative origins handled by shifting both
	 * `src` and `dst` together, so partial off-screen copies work as
	 * expected.
	 *
	 * This only writes to the in-memory framebuffer; call {@link draw} to
	 * rasterise it.
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
		// validate the input rects
		if (src.rows !== dst.rows || src.cols !== dst.cols) {
			console.log(
				"Terminal.blit: not blitting due to bad src or dst",
			);
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
	 * Clears the framebuffer. If the canvas has been resized since the
	 * last clear, the framebuffer is reallocated to the new `rows` x
	 * `cols` size. Resets {@link detail_text} to `""`.
	 *
	 * Call at the start of each frame, before blitting content.
	 */
	clear() {
		const gl = this.canvas.gl;

		if (this.resized) {
			this.resized = false;

			gl.useProgram(this.gl_program);
			gl.uniform1i(this.uniforms.rows, this.canvas.rows);
			gl.uniform1i(this.uniforms.cols, this.canvas.cols);

			this.fbcon = new Uint16Array(
				this.canvas.rows * this.canvas.cols,
			);
		}

		this.fbcon.fill(0);

		this.detail_text = "";
	}

	/**
	 * Rasterise the console framebuffer to the canvas.
	 *
	 * If {@link detail_text} changed since the last draw it is recompiled
	 * to glyphs and blitted across the bottom row. Then the framebuffer
	 * is uploaded and drawn.
	 *
	 * Call this once per frame after all {@link blit} calls are done.
	 */
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

		// set mouse position uniforms
		gl.uniform1i(
			this.uniforms.mouse_row,
			this.canvas.mouse_row ?? -1,
		);
		gl.uniform1i(
			this.uniforms.mouse_col,
			this.canvas.mouse_col ?? -1,
		);

		// upload glyph data to the GPU
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.bufferData(gl.ARRAY_BUFFER, this.fbcon, gl.DYNAMIC_DRAW);

		// bind and activate the bitmap font
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.canvas.bitmap_font);

		// user application-provided font
		if (this.use_user_font) {
			gl.uniform1i(this.uniforms.use_user_font, 1);
		}

		if (this.canvas.user_font !== null) {
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, this.canvas.user_font);
		} else if (this.use_user_font) {
			this.use_user_font = false;
			gl.uniform1i(this.uniforms.use_user_font, 0);
		}

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

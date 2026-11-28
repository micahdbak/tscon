import { Canvas } from "../canvas/canvas.ts";
import {
	compileProgram,
	getAttribLocations,
	getUniformLocations,
} from "../program.ts";
import type { Rect } from "../rect.ts";
import { renderer_frag, renderer_vert } from "./shaders.ts";
import type { TexGlyphs } from "./tex_glyphs.ts";

/**
 * Draw a texture directly or as coloured characters on a {@link Canvas}.
 *
 * Use {@link textureGlyphs} to prepare the sampling grid for {@link draw}.
 *
 * @example
 * ```ts
 * const renderer = new Renderer(canvas);
 * const grid = textureGlyphs(12, 24, TexGlyphMode.GLYPHS);
 * renderer.draw(grid, texture, { row: 0, col: 0, rows: 12, cols: 24 });
 * ```
 */
export class Renderer {
	private readonly gl_program: WebGLProgram;
	private readonly uniforms: Record<string, WebGLUniformLocation>;

	private readonly vao: WebGLVertexArrayObject;
	private readonly vbo: WebGLBuffer;

	private resized: boolean;

	/** The {@link Canvas} this renderer draws into. */
	public canvas: Canvas;

	/**
	 * Whether to use {@link Canvas.user_font} for non-box glyphs when
	 * available. Set to `true` by the application after assigning a font
	 * texture to `canvas.user_font`; automatically falls back to the bitmap
	 * font if `user_font` is `null`.
	 */
	public use_user_font: boolean;

	/**
	 * Create a renderer that follows the canvas grid size.
	 *
	 * @example
	 * ```ts
	 * const renderer = new Renderer(canvas);
	 * ```
	 *
	 * @param canvas  The canvas to draw into.
	 */
	constructor(canvas: Canvas) {
		this.canvas = canvas;
		const gl = canvas.gl;

		this.gl_program = compileProgram(
			gl,
			renderer_vert,
			renderer_frag,
		);

		const attributes = getAttribLocations(gl, this.gl_program, {
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
			palette: "u_palette",
			bitmap_font: "u_bitmap_font",
			texture: "u_texture",
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

		// textureGlyphs packs the row and mode above the 16-bit column.
		gl.vertexAttribIPointer(
			attributes.row,
			1,
			gl.UNSIGNED_BYTE,
			4,
			3,
		);
		gl.vertexAttribDivisor(attributes.row, 1);
		gl.enableVertexAttribArray(attributes.row);

		gl.vertexAttribIPointer(
			attributes.mode,
			1,
			gl.UNSIGNED_BYTE,
			4,
			2,
		);
		gl.vertexAttribDivisor(attributes.mode, 1);
		gl.enableVertexAttribArray(attributes.mode);

		gl.vertexAttribIPointer(
			attributes.col,
			1,
			gl.UNSIGNED_SHORT,
			4,
			0,
		);
		gl.vertexAttribDivisor(attributes.col, 1);
		gl.enableVertexAttribArray(attributes.col);

		gl.bindVertexArray(null);

		gl.useProgram(this.gl_program);
		gl.uniform1i(this.uniforms.canvas_rows, this.canvas.rows);
		gl.uniform1i(this.uniforms.canvas_cols, this.canvas.cols);
		gl.uniform1i(this.uniforms.bitmap_font, 0);
		gl.uniform1i(this.uniforms.texture, 1);
		gl.uniform1i(this.uniforms.user_font, 2);

		this.resized = false;

		this.use_user_font = false;

		this.canvas.addEventListener("resize", () => {
			this.resized = true;
		});
	}

	/**
	 * Draw a {@link TexGlyphs} grid sampling `texture` into a region of the
	 * canvas.
	 *
	 * The destination must match the grid dimensions. It can extend off
	 * canvas, with clipping that preserves the source texture mapping.
	 * The destination's pixel aspect ratio sets the drawn image's aspect.
	 *
	 * @example
	 * ```ts
	 * renderer.draw(tglyphs, texture, {
	 *   row: 0, col: 0,
	 *   rows: tglyphs.rows, cols: tglyphs.cols,
	 * });
	 * ```
	 *
	 * @param tglyphs  Texture-glyph grid describing how to sample.
	 * @param texture  Source texture to sample from.
	 * @param dst      Destination region on the canvas (cells).
	 */
	draw(tglyphs: TexGlyphs, texture: WebGLTexture, dst: Rect) {
		if (tglyphs.rows !== dst.rows || tglyphs.cols !== dst.cols) {
			console.log(
				"Renderer.draw: skipping due to bad tglyphs or dst",
			);
			return;
		}

		const gl = this.canvas.gl;
		gl.useProgram(this.gl_program);
		gl.uniform3fv(this.uniforms.palette, this.canvas.palette);

		if (this.resized) {
			this.resized = false;

			gl.uniform1i(
				this.uniforms.canvas_rows,
				this.canvas.rows,
			);
			gl.uniform1i(
				this.uniforms.canvas_cols,
				this.canvas.cols,
			);
		}

		gl.uniform1i(this.uniforms.row, dst.row);
		gl.uniform1i(this.uniforms.col, dst.col);
		gl.uniform1i(this.uniforms.rows, tglyphs.rows);
		gl.uniform1i(this.uniforms.cols, tglyphs.cols);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.bufferData(gl.ARRAY_BUFFER, tglyphs.data, gl.DYNAMIC_DRAW);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.canvas.bitmap_font);

		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, texture);

		const user_font = this.canvas.user_font;
		const use_user_font = this.use_user_font && user_font !== null;
		gl.uniform1i(this.uniforms.use_user_font, Number(use_user_font));

		if (use_user_font) {
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, user_font);
		}

		gl.bindVertexArray(this.vao);
		gl.drawArraysInstanced(
			gl.TRIANGLES,
			0,
			6,
			tglyphs.rows * tglyphs.cols,
		);
		gl.bindVertexArray(null);
	}
}

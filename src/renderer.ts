import { renderer_frag, renderer_vert } from "./shaders.ts";
import { Canvas } from "./canvas.ts";
import { TexGlyphs } from "./glyphs.ts";
import {
	compileProgram,
	getAttribLocations,
	getUniformLocations,
} from "./program.ts";
import { Rect } from "./rect.ts";

/**
 * Renders a source texture as glyphs onto a {@link Canvas}.
 *
 * `Renderer` draws a grid of {@link TexGlyphs} cells, sampling an
 * application-provided texture per cell according to each cell's
 * {@link TexGlyphMode}. An application renders into a texture (e.g. a
 * framebuffer object) and then calls {@link draw} with a matching
 * {@link TexGlyphs} grid to draw that texture directly or as dithered
 * coloured characters.
 */
export class Renderer {
	private gl_program: WebGLProgram;

	private attributes: Record<string, number>;
	private uniforms: Record<string, WebGLUniformLocation>;

	private vao: WebGLVertexArrayObject;
	private vbo: WebGLBuffer;

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
	 * Initializes the renderer for use.
	 * Listens for `"resize"` events from the canvas.
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

		// every vertex in the VBO is a 32-bit integer split like so:
		// [ row    | mode   | col     ]
		// [ 8-bits | 8-bits | 16-bits ]

		// a_row
		gl.vertexAttribIPointer(
			this.attributes.row,
			1,
			gl.UNSIGNED_BYTE,
			4,
			3,
		);
		gl.vertexAttribDivisor(this.attributes.row, 1);
		gl.enableVertexAttribArray(this.attributes.row);

		// a_mode
		gl.vertexAttribIPointer(
			this.attributes.mode,
			1,
			gl.UNSIGNED_BYTE,
			4,
			2,
		);
		gl.vertexAttribDivisor(this.attributes.mode, 1);
		gl.enableVertexAttribArray(this.attributes.mode);

		// a_col
		gl.vertexAttribIPointer(
			this.attributes.col,
			1,
			gl.UNSIGNED_SHORT,
			4,
			0,
		);
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
		gl.uniform1i(this.uniforms.user_font, 2);
		gl.uniform1i(this.uniforms.use_user_font, 0);

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
	 * `tglyphs.rows`/`cols` must match `dst.rows`/`cols`; otherwise the
	 * draw is skipped. `dst` is in canvas cell coordinates and may extend
	 * beyond the canvas; the shader clips via NDC. Use a `tglyphs` grid
	 * sized to the texture's aspect so the texture isn't distorted.
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

		// set destination information uniforms
		gl.uniform1i(this.uniforms.row, dst.row);
		gl.uniform1i(this.uniforms.col, dst.col);
		gl.uniform1i(this.uniforms.rows, tglyphs.rows);
		gl.uniform1i(this.uniforms.cols, tglyphs.cols);
		gl.uniform1i(
			this.uniforms.mouse_row,
			this.canvas.mouse_row ?? -1,
		);
		gl.uniform1i(
			this.uniforms.mouse_col,
			this.canvas.mouse_col ?? -1,
		);

		// set vertex buffer data to provided texture glyphs
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.bufferData(gl.ARRAY_BUFFER, tglyphs.data, gl.DYNAMIC_DRAW);

		// bind and activate bitmap font
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.canvas.bitmap_font);

		// bind and activate provided texture
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, texture);

		// user application-provided font
		if (this.use_user_font) {
			gl.uniform1i(this.uniforms.use_user_font, 1);
		}

		if (this.canvas.user_font !== null) {
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, this.canvas.user_font);
		} else if (this.use_user_font) {
			this.use_user_font = false;
			gl.uniform1i(this.uniforms.use_user_font, 0);
		}

		// draw the glyphs covered by the provided texture glyphs
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

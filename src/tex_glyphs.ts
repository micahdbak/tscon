/**
 * How each cell of a {@link TexGlyphs} grid samples its source texture.
 *
 * The value is packed into each texture-glyph and read by the renderer's
 * vertex shader to decide, per cell, how to turn the source texture into a
 * drawn glyph.
 *
 * - `SAMPLE`    -- render the source texture directly. Each cell is given UV
 *                  coordinates into the texture, so the full rendered region
 *                  simply shows the source texture as-is.
 * - `GLYPHS`    -- sample the texture and convert it to a glyph: the
 *                  character is chosen by the sample's brightness and the
 *                  colour by dithering (Bayer matrix + nearest palette hue).
 *                  The background stays black. Preferred when you want the
 *                  texture rendered as coloured characters without it being
 *                  too bright or jarring.
 * - `BG_GLYPHS` -- like `GLYPHS`, but also sets the background colour, so
 *                  the full glyph (foreground + background) carries more of
 *                  the sample's colour. This is noticeably brighter and more
 *                  visually accurate; use it when no text is drawn on top of
 *                  the rendered texture.
 * - `MIX`       -- alternate `SAMPLE`/`GLYPHS` in a checkerboard pattern.
 * - `ROWS`      -- alternate `SAMPLE`/`GLYPHS` by row.
 * - `COLS`      -- alternate `SAMPLE`/`GLYPHS` by column.
 */
export enum TexGlyphMode {
	SAMPLE = 0,
	GLYPHS = 1,
	BG_GLYPHS = 2,
	MIX = 3,
	ROWS = 4,
	COLS = 5,
}

/**
 * A grid of texture-sampling descriptors produced by {@link textureGlyphs}
 * and consumed by {@link Renderer.draw}.
 *
 * Each cell is a 32-bit value packing the cell's row, its {@link TexGlyphMode},
 * and its column: `[ row (8) | mode (8) | col (16) ]`.
 *
 * `data` is laid out row-major with `rows * cols` entries.
 */
export type TexGlyphs = {
	/** Packed texture-glyph data, length `rows * cols`, row-major. */
	data: Uint32Array;
	/** Number of rows in the grid. */
	rows: number;
	/** Number of columns in the grid. */
	cols: number;
};

// MIX/ROWS/COLS alternate cells between SAMPLE and GLYPHS by their
// pattern; the other modes apply to every cell as-is
function cellMode(mode: TexGlyphMode, row: number, col: number): TexGlyphMode {
	switch (mode) {
		case TexGlyphMode.MIX:
			return (row + col) % 2 === 0 ? TexGlyphMode.SAMPLE : TexGlyphMode.GLYPHS;

		case TexGlyphMode.ROWS:
			return row % 2 === 0 ? TexGlyphMode.SAMPLE : TexGlyphMode.GLYPHS;

		case TexGlyphMode.COLS:
			return col % 2 === 0 ? TexGlyphMode.SAMPLE : TexGlyphMode.GLYPHS;

		default:
			return mode;
	}
}

/**
 * Build a {@link TexGlyphs} grid of `rows` by `cols` cells that samples a
 * texture in the given {@link TexGlyphMode}.
 *
 * The grid is sized to match a region of the terminal (typically the whole
 * canvas, `canvas.rows` x `canvas.cols`, or a smaller sub-region) and is
 * passed to {@link Renderer.draw} along with the texture to display.
 *
 * For the `MIX`, `ROWS`, and `COLS` modes the requested `mode` is used as a
 * base and individual cells are switched between `SAMPLE` and `GLYPHS`
 * according to the pattern (see {@link TexGlyphMode} for what each mode does
 * to the sampled texture). The packed per-cell value encodes the cell's own
 * row/column and the (possibly per-cell) effective mode.
 *
 * @example
 * ```ts
 * import { TexGlyphMode, textureGlyphs } from "@micahdb/tscon";
 *
 * // whole-canvas glyphs that sample the texture as coloured characters
 * const tg = textureGlyphs(canvas.rows, canvas.cols, TexGlyphMode.GLYPHS);
 * ```
 *
 * @param rows  Height of the grid in cells.
 * @param cols  Width of the grid in cells.
 * @param mode  Sampling mode to apply to the cells.
 * @returns     The packed texture-glyph grid.
 */
export function textureGlyphs(
	rows: number,
	cols: number,
	mode: TexGlyphMode,
): TexGlyphs {
	const tglyphs = {
		data: new Uint32Array(rows * cols),
		rows,
		cols,
	};

	for (let index = 0; index < rows * cols; index++) {
		const row = Math.floor(index / cols);
		const col = index % cols;
		const cell_mode = cellMode(mode, row, col);

		tglyphs.data[index] = ((row & 0xff) << 24) | ((cell_mode & 0xff) << 16) |
			(col & 0xffff);
	}

	return tglyphs;
}

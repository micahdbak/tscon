/**
 * How a texture is drawn as cells, chosen per grid by
 * {@link textureGlyphs} and drawn by {@link Renderer.draw}.
 *
 * - `SAMPLE`    -- draw the texture as it is, so the region looks like the
 *                  texture. This is the photographic mode.
 * - `GLYPHS`    -- draw the texture as coloured characters on a black
 *                  background. Softer and less busy than `BG_GLYPHS`, and
 *                  the safe choice when text is drawn over the region.
 * - `BG_GLYPHS` -- like `GLYPHS`, but the character backgrounds carry
 *                  colour too. Brighter and more faithful; use it when
 *                  nothing is drawn on top of the region.
 * - `MIX`       -- alternate `SAMPLE` and `GLYPHS` cell by cell, in a
 *                  checkerboard.
 * - `ROWS`      -- alternate `SAMPLE` and `GLYPHS` row by row.
 * - `COLS`      -- alternate `SAMPLE` and `GLYPHS` column by column.
 *
 * @example
 * ```ts
 * import { TexGlyphMode, textureGlyphs } from "@micahdb/tscon";
 *
 * // a 24x48 region drawn as bright coloured characters
 * const tg = textureGlyphs(24, 48, TexGlyphMode.BG_GLYPHS);
 * ```
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
 * A description of how to draw a texture as cells: one entry per cell saying
 * which part of the texture it shows and how, built by
 * {@link textureGlyphs} and drawn by {@link Renderer.draw}.
 *
 * The grid must be the same size as the region it is drawn into, so size it
 * to the area the texture should fill.
 *
 * @example
 * ```ts
 * import { TexGlyphMode, textureGlyphs } from "@micahdb/tscon";
 * import type { TexGlyphs } from "@micahdb/tscon";
 *
 * const tg: TexGlyphs = textureGlyphs(24, 48, TexGlyphMode.SAMPLE);
 *
 * tg.rows;   // 24
 * tg.cols;   // 48
 * ```
 */
export type TexGlyphs = {
	/** One entry per cell, row-major, `rows * cols` in all. */
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
 * Build a {@link TexGlyphs} grid of `rows` by `cols` cells that draws a
 * texture in the given {@link TexGlyphMode}.
 *
 * Size the grid to the region you want the texture to fill -- the whole
 * canvas, or part of it -- and pass it to {@link Renderer.draw} with the
 * texture. A grid only fits a region of exactly the same size.
 *
 * The `MIX`, `ROWS`, and `COLS` modes pick between `SAMPLE` and `GLYPHS` per
 * cell, following their pattern.
 *
 * @example
 * ```ts
 * import { TexGlyphMode, textureGlyphs } from "@micahdb/tscon";
 *
 * // the whole canvas, texture shown as coloured characters
 * const full = textureGlyphs(canvas.rows, canvas.cols, TexGlyphMode.GLYPHS);
 *
 * // a 24x48 inset, texture shown as it is
 * const inset = textureGlyphs(24, 48, TexGlyphMode.SAMPLE);
 * ```
 *
 * @param rows  Height of the grid in cells.
 * @param cols  Width of the grid in cells.
 * @param mode  How the texture is drawn in each cell.
 * @returns     The grid, ready for {@link Renderer.draw}.
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

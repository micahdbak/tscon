/**
 * How a texture is drawn as cells, chosen per grid by
 * {@link textureGlyphs} and drawn by {@link Renderer.draw}.
 *
 * - `SAMPLE` displays the original texture.
 * - `GLYPHS` draws coloured characters on the theme background.
 * - `BG_GLYPHS` selects both foreground and background from the texture.
 * - `MIX`, `ROWS`, and `COLS` alternate `SAMPLE` and `GLYPHS` by cell,
 *   row, or column.
 *
 * @example
 * ```ts
 * import * as tscon from "@micahdb/tscon";
 *
 * // a 24x48 region drawn as bright coloured characters
 * const tg = tscon.textureGlyphs(24, 48, tscon.TexGlyphMode.BG_GLYPHS);
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
 * A texture sampling grid from {@link textureGlyphs} for {@link Renderer.draw}.
 *
 * @example
 * ```ts
 * import * as tscon from "@micahdb/tscon";
 *
 * const tg: tscon.TexGlyphs = tscon.textureGlyphs(24, 48, tscon.TexGlyphMode.SAMPLE);
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
 * @example
 * ```ts
 * import * as tscon from "@micahdb/tscon";
 *
 * // the whole canvas, texture shown as coloured characters
 * const full = tscon.textureGlyphs(canvas.rows, canvas.cols, tscon.TexGlyphMode.GLYPHS);
 *
 * // a 24x48 inset, texture shown as it is
 * const inset = tscon.textureGlyphs(24, 48, tscon.TexGlyphMode.SAMPLE);
 * ```
 *
 * @param rows  Height in cells. The packed row index supports up to 256 rows.
 * @param cols  Width in cells. The packed column index supports up to 65536 columns.
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

/**
 * A position in a cell grid: a row and a column.
 *
 * Rows are counted from the top and columns from the left, in whole cells.
 * This is the coordinate system everything in tscon is expressed in: the
 * top-left cell of a {@link Rect} is a `Cell`, and the positions
 * {@link Glyphs} reports are `Cell`s.
 *
 * @example
 * ```ts
 * import type { Cell } from "@micahdb/tscon";
 *
 * const at: Cell = { row: 3, col: 7 };   // row 3, column 7
 * ```
 */
export type Cell = {
	/** Row index (y), counted from the top. */
	row: number;
	/** Column index (x), counted from the left. */
	col: number;
};

/**
 * A horizontal run of cells on one row, from column `from` (inclusive) to
 * column `to` (exclusive).
 *
 * This is the shape {@link Glyphs.spansFor} returns: a source range that
 * crosses a wrapped row break comes back as one span per row.
 *
 * @example
 * ```ts
 * import type { CellSpan } from "@micahdb/tscon";
 *
 * // columns 4, 5, and 6 of row 2
 * const span: CellSpan = { row: 2, from: 4, to: 7 };
 * ```
 */
export type CellSpan = {
	/** The row the run lies on. */
	row: number;
	/** First column of the run, inclusive. */
	from: number;
	/** One past the run's last column. */
	to: number;
};

/**
 * The three byte fields in a packed terminal cell.
 *
 * @example
 * ```ts
 * import { unpackCell } from "@micahdb/tscon";
 *
 * const glyph = unpackCell(0x101141);
 * // { char_code: 65, foreground: 16, background: 17 }
 * ```
 *
 * See {@link packCell} and {@link unpackCell}.
 */
export type CellAttributes = {
	char_code: number;
	foreground: number;
	background: number;
};

/**
 * Pack a terminal cell into the 32-bit word stored in {@link Glyphs.data}.
 *
 * The low three bytes hold the glyph, background, and foreground in that
 * order. The top byte is reserved. An all-zero word is transparent.
 * When an index is outside the active palette, the terminal draws that
 * channel in its theme colour.
 *
 * @example
 * ```ts
 * import { Colour, packCell } from "@micahdb/tscon";
 *
 * const cell = packCell(65, Colour.FG, Colour.BG);
 * ```
 *
 * @param char_code   CP437 character code (low eight bits).
 * @param foreground  Foreground palette index (low eight bits).
 * @param background  Background palette index (low eight bits).
 * @returns           The packed word, readable with {@link unpackCell}.
 */
export function packCell(char_code: number, foreground: number, background: number): number {
	return (foreground & 0xff) << 16 | (background & 0xff) << 8 | (char_code & 0xff);
}

/**
 * Read the byte fields of a terminal cell stored in {@link Glyphs.data}.
 *
 * @example
 * ```ts
 * import { unpackCell } from "@micahdb/tscon";
 *
 * const { foreground } = unpackCell(0x101141); // 16
 * ```
 *
 * @param cell   A word from {@link packCell} or the glyph grid.
 * @returns      The character code and palette indices, including zero fields
 *               for the transparent word.
 */
export function unpackCell(cell: number): CellAttributes {
	return {
		char_code: cell & 0xff,
		foreground: (cell >>> 16) & 0xff,
		background: (cell >>> 8) & 0xff,
	};
}

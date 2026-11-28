/**
 * A row and column in a cell grid.
 *
 * Rows count down from the top and columns count right from the left.
 * Rects and {@link Glyphs} positions use the same shape.
 *
 * @example
 * ```ts
 * import * as tscon from "@micahdb/tscon";
 *
 * const at: tscon.Cell = { row: 3, col: 7 };   // row 3, column 7
 * ```
 */
export type Cell = {
	/** Row index (y), counted from the top. */
	row: number;
	/** Column index (x), counted from the left. */
	col: number;
};

/**
 * The three byte fields in a packed terminal cell.
 *
 * @example
 * ```ts
 * import * as tscon from "@micahdb/tscon";
 *
 * const glyph = tscon.unpackCell(0x101141);
 * // { char_code: 65, foreground: 16, background: 17 }
 * ```
 *
 * See {@link packCell} and {@link unpackCell}.
 */
export type CellAttributes = {
	/** CP437 character code. */
	char_code: number;
	/** Foreground palette index. */
	foreground: number;
	/** Background palette index. */
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
 * import * as tscon from "@micahdb/tscon";
 *
 * const cell = tscon.packCell(65, tscon.Colour.FG, tscon.Colour.BG);
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
 * import * as tscon from "@micahdb/tscon";
 *
 * const { foreground } = tscon.unpackCell(0x101141); // 16
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

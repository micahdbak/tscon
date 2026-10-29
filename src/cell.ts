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

/**
 * A single cell position in a glyph grid or terminal: row and column.
 *
 * Rows and columns are integer cell indices, counted top-to-bottom and
 * left-to-right. This is the coordinate system {@link Rect} positions:
 * a `Rect` is placed by the `Cell` at its top-left corner.
 *
 * @example
 * ```ts
 * import type { Cell } from "@micahdb/tscon";
 *
 * const at: Cell = { row: 3, col: 7 };
 * ```
 */
export type Cell = {
	/** Row index (y), counted from the top. */
	row: number;
	/** Column index (x), counted from the left. */
	col: number;
};

/**
 * A horizontal run of cells on one row: columns `from` (inclusive) to
 * `to` (exclusive).
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

/**
 * A rectangular region of a terminal grid, expressed in cell coordinates.
 *
 * A `Rect` describes a region by its top-left origin (`row`, `col`) and its
 * size in cells (`rows`, `cols`). It is used throughout tscon to describe both
 * source regions of glyph data and destination regions on the canvas when
 * blitting.
 *
 * @example
 * ```ts
 * import type { Rect } from "@creat/tscon";
 *
 * // a 10x40 region starting at row 2, column 4
 * const region: Rect = { row: 2, col: 4, rows: 10, cols: 40 };
 * ```
 */
export type Rect = {
	/** Row index (y) of the top-left cell of the region. */
	row: number;
	/** Column index (x) of the top-left cell of the region. */
	col: number;
	/** Height of the region, in cells (rows). */
	rows: number;
	/** Width of the region, in cells (columns). */
	cols: number;
};

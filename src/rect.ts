/**
 * A region of a terminal grid for {@link Terminal.blit} or {@link Renderer.draw}.
 *
 * @example
 * ```ts
 * import * as tscon from "@micahdb/tscon";
 *
 * // a 10x40 region starting at row 2, column 4
 * const region: tscon.Rect = { row: 2, col: 4, rows: 10, cols: 40 };
 * ```
 */
export type Rect = {
	/** Top row, zero-based. */
	row: number;
	/** Left column, zero-based. */
	col: number;
	/** Height in rows. */
	rows: number;
	/** Width in columns. */
	cols: number;
};

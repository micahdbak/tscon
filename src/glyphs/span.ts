import type { Rect } from "../rect.ts";
import type { Terminal } from "../terminal/terminal.ts";
import type { Cell } from "./cell.ts";
import type { Glyphs } from "./glyphs.ts";

/**
 * A horizontal run of cells on one row, from column `from` (inclusive) to
 * column `to` (exclusive).
 *
 * {@link Glyphs.spansFor} returns one span per row for a source range that
 * crosses a wrapped row break.
 *
 * @example
 * ```ts
 * import type { Span } from "@micahdb/tscon";
 *
 * // columns 4, 5, and 6 of row 2
 * const span: Span = { row: 2, from: 4, to: 7 };
 * ```
 */
export type Span = {
	/** The row the run lies on. */
	row: number;
	/** First column of the run, inclusive. */
	from: number;
	/** One past the run's last column. */
	to: number;
};

/**
 * A selection of cells in one {@link Glyphs} grid, as one or more
 * {@link Span} runs.
 *
 * {@link Glyphs.spansFor} resolves a source range into spans. Use
 * {@link contains} for hit testing, {@link mapCells} to decorate only the
 * selected cells, and {@link blit} to copy them to a terminal at an origin.
 * Iterate the selection to inspect its individual runs.
 *
 * @example
 * ```ts
 * import { Glyphs } from "@micahdb/tscon";
 *
 * const glyphs = new Glyphs("aaaa bbbb", 5);
 * const spans = glyphs.spansFor(2, 6);
 *
 * spans.contains(1, 0);   // true: the run on the second row
 * spans.contains(0, 1);   // true
 * spans.contains(0, 0);   // false
 * ```
 */
export class Spans implements Iterable<Span> {
	/** The grid the spans select cells in. */
	readonly glyphs: Glyphs;

	private readonly runs: Span[];

	/**
	 * Create a selection over a grid from explicit runs.
	 *
	 * The runs are copied, so later changes to `runs` do not affect the
	 * selection.
	 *
	 * @example
	 * ```ts
	 * import { Glyphs, Spans } from "@micahdb/tscon";
	 *
	 * const glyphs = new Glyphs("hello", 5);
	 * const spans = new Spans(glyphs, [{ row: 0, from: 1, to: 4 }]);
	 * ```
	 *
	 * @param glyphs  The grid the spans select cells in.
	 * @param runs    The row runs to select.
	 */
	constructor(glyphs: Glyphs, runs: readonly Span[]) {
		this.glyphs = glyphs;
		this.runs = runs.map((run) => ({ ...run }));
	}

	/** Iterate the selected runs in their given order. */
	[Symbol.iterator](): Iterator<Span> {
		return this.runs[Symbol.iterator]();
	}

	/**
	 * Whether a cell lies in the selection.
	 *
	 * @example
	 * ```ts
	 * import { Glyphs } from "@micahdb/tscon";
	 *
	 * const spans = new Glyphs("abcd", 4).spansFor(1, 3);
	 *
	 * spans.contains(0, 0);   // false
	 * spans.contains(0, 1);   // true
	 * spans.contains(0, 3);   // false
	 * ```
	 *
	 * @param row  The row to test.
	 * @param col  The column to test.
	 * @returns    `true` when the cell falls inside any selected run.
	 */
	contains(row: number, col: number): boolean {
		for (const run of this.runs) {
			if (run.row === row && col >= run.from && col < run.to) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Whether another selection has identical runs in the same order.
	 *
	 * Only geometry is compared: the grids and their glyph data may differ.
	 *
	 * @example
	 * ```ts
	 * import { Glyphs } from "@micahdb/tscon";
	 *
	 * const first = new Glyphs("abcd", 4).spansFor(1, 3);
	 * const second = new Glyphs("wxyz", 4).spansFor(1, 3);
	 *
	 * first.equals(second);   // true
	 * ```
	 *
	 * @param other  The selection to compare with.
	 * @returns      `true` when both selections have identical runs.
	 */
	equals(other: Spans): boolean {
		if (this.runs.length !== other.runs.length) {
			return false;
		}

		for (let index = 0; index < this.runs.length; index++) {
			const left = this.runs[index]!;
			const right = other.runs[index]!;

			if (left.row !== right.row || left.from !== right.from || left.to !== right.to) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Transform the selected cells and return a new selection over the copy.
	 *
	 * Unselected cells keep their original values. The returned selection
	 * keeps this selection's runs.
	 *
	 * @example
	 * ```ts
	 * import { Glyphs, packCell, unpackCell } from "@micahdb/tscon";
	 *
	 * const spans = new Glyphs("abcd", 4).spansFor(1, 3);
	 * const inverted = spans.mapCells((cell) => {
	 *     const glyph = unpackCell(cell);
	 *     return packCell(glyph.char_code, glyph.background, glyph.foreground);
	 * });
	 * ```
	 *
	 * @param fn  Receives each selected cell's value and position; returns
	 *            the value to use instead.
	 * @returns   A selection over the transformed grid.
	 */
	mapCells(fn: (cell: number, row: number, col: number) => number): Spans {
		const glyphs = this.glyphs.mapCells((cell, row, col) => {
			return this.contains(row, col) ? fn(cell, row, col) : cell;
		});

		return new Spans(glyphs, this.runs);
	}

	/**
	 * Copy the selected cells to a terminal at an origin.
	 *
	 * Each run becomes one blit. A destination cell outside `clip` is left
	 * untouched; without a clip, {@link Terminal.blit} still clips to the
	 * canvas.
	 *
	 * @example
	 * ```ts
	 * const spans = glyphs.spansFor(2, 6);
	 *
	 * spans.blit(terminal, { row: 1, col: 2 });
	 * ```
	 *
	 * @param terminal  The terminal to blit into.
	 * @param origin    Destination of the selection grid's `(0, 0)` cell.
	 * @param clip      Optional destination region to restrict the blit to.
	 */
	blit(terminal: Terminal, origin: Cell, clip?: Rect): void {
		for (const run of this.runs) {
			const row = origin.row + run.row;
			let from = run.from;
			let to = run.to;
			let col = origin.col + run.from;

			if (clip !== undefined) {
				const row_inside = row >= clip.row && row < clip.row + clip.rows;
				const clipped_from = Math.max(col, clip.col);
				const clipped_to = Math.min(col + to - from, clip.col + clip.cols);

				if (!row_inside || clipped_from >= clipped_to) {
					continue;
				}

				from += clipped_from - col;
				to = from + clipped_to - clipped_from;
				col = clipped_from;
			}

			const width = to - from;

			terminal.blit(
				this.glyphs,
				{ row: run.row, col: from, rows: 1, cols: width },
				{ row, col, rows: 1, cols: width },
			);
		}
	}
}

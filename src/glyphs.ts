import { scanEscapeAt } from "./escape.ts";
import { TAB_WIDTH, layoutText } from "./wrap.ts";
import type { TextLayout, TextOptions } from "./wrap.ts";
import { Colour } from "./colour.ts";
import { charCodeInCp437 } from "./cp437.ts";
import type { Cell, CellSpan } from "./cell.ts";
import type { Rect } from "./rect.ts";

/**
 * A named position inside a {@link Glyphs} block, produced by an `\aX`
 * anchor escape sequence in the source text.
 *
 * The anchor occupies zero columns. It captures the position of the
 * glyph that follows it: the cell where the next visible character
 * renders -- possibly on a later wrapped row, past a tab, or at the end
 * of the last row when nothing follows. `options` carries the escape's
 * `{...}` payload verbatim, or `null` when the braces are absent or
 * empty. A payload that never closes on its line renders as raw text
 * instead and records no anchor.
 *
 * Anchors are keyed by group number 0-9 in {@link Glyphs.anchors}, in
 * source order. What a group means, and what draws over the captured
 * cells, is the application's business: links, images, headings --
 * whatever the downstream code blits over them.
 *
 * @example
 * ```ts
 * import { Glyphs } from "@micahdb/tscon";
 *
 * const g = new Glyphs("\\a0{Foo|bar}Foo", 10);
 *
 * g.anchors[0]![0]!.options; // "Foo|bar"
 * g.anchors[0]![0]!.row;     // 0
 * g.anchors[0]![0]!.col;     // 0: where "F" renders
 * ```
 */
export type Anchor = {
	/** The `{...}` payload, or `null` when absent or empty. */
	options: string | null;
	/** Wrapped row of the captured cell. */
	row: number;
	/** Column of the captured cell. */
	col: number;
};

/**
 * Text compiled for the terminal: the source text, its wrapped layout,
 * the rendered grid of glyph cells, and the translation between source
 * character indices and cell positions -- one object, one compile.
 *
 * Construction runs the full pipeline: {@link textToLines} lays the text
 * out into verbatim source slices, then one walk renders the cells (and
 * records anchors) while remembering which source character ended up in
 * which cell. Compile once per text and width, then read positions from
 * the result; nothing here touches the GPU.
 *
 * All positions are region-relative: `row` is the wrapped row within
 * the grid and `col` the column, exactly the coordinates
 * {@link Terminal.blit}'s `src` and `dst` rects use. Zero-width escapes
 * (anchors, colours) occupy no cells; a cursor resting on one displays
 * on the cell of the glyph that follows it.
 *
 * @example
 * ```ts
 * import { Glyphs } from "@micahdb/tscon";
 *
 * const g = new Glyphs("hello \\f1world", 80);
 *
 * g.data;               // packed cells, ready for Terminal.blit
 * g.renderedCell(6);    // { row: 0, col: 6 }: where "w" renders
 * g.cursorIndex(0, 9);  // 8: the source character under a click
 * g.anchors[0];         // \a0 anchors and the cells they captured
 * ```
 */
export class Glyphs {
	/** The source text, unaltered from construction. */
	readonly sourceText: string;

	/** The laid-out text: one string per wrapped row, escapes preserved. */
	readonly wrappedText: string[];

	/** Packed glyph cells, row-major, `rows * cols` entries. */
	readonly data: Uint16Array;

	/** Number of wrapped rows in the grid. */
	readonly rows: number;

	/** Number of columns in the grid. */
	readonly cols: number;

	/**
	 * Anchors keyed by group number (0-9). Each value is the list of
	 * anchors in that group, in the order they appear in the text.
	 */
	readonly anchors: Record<number, Anchor[]>;

	/** Per wrapped row: the source index of each visible column. */
	private readonly visible_to_source: number[][];

	/** Per source character: the cell it renders into, if any. */
	private readonly source_to_cell: (Cell | undefined)[];

	/** The source index of the last visible character, or -1 when empty. */
	private last_source: number;

	/**
	 * Compile `text` into wrapped rows, glyph cells, and the position
	 * map between them.
	 *
	 * The text is laid out per {@link TextOptions}, then rendered into
	 * packed 16-bit cells: colour escapes set the colours of the
	 * characters that follow (clamped to the dark half, capitals
	 * selecting the bright half), tabs advance to the next multiple of
	 * {@link TAB_WIDTH} without emitting, and characters outside CP437
	 * map through {@link charCodeInCp437}. A space on the all-black
	 * colour byte is left as zero, which the shader clips; the default
	 * colours are white-on-black.
	 *
	 * @example
	 * ```ts
	 * import { Glyphs, Wrap } from "@micahdb/tscon";
	 *
	 * const g = new Glyphs("long text", 4, { wrap: Wrap.HARD });
	 * g.rows; // 2
	 * ```
	 *
	 * @param text  The text to compile, with escape sequences.
	 * @param cols  Width of the grid in cells. If `<= 0`, the grid is
	 *              empty.
	 * @param opts  Layout options: how over-long lines break, and
	 *              whether escapes render raw. Defaults to word wrap
	 *              with escapes live.
	 */
	constructor(text: string, cols: number, opts: TextOptions = {}) {
		this.sourceText = text;

		const layout = layoutText(text, cols, opts);

		this.wrappedText = layout.pieces;
		this.rows = layout.pieces.length;
		this.cols = this.rows > 0 ? cols : 0;
		this.data = new Uint16Array(this.rows * this.cols);
		this.anchors = {};

		this.visible_to_source = [];
		this.source_to_cell = [];
		this.last_source = -1;

		this.build(layout, opts.raw === true);
	}

	// renders the pieces into cells while mapping both ways between
	// source indices and cell positions. Anchors record the cell of the
	// glyph that follows them, so they stay pending across tabs, row
	// breaks, and anything else that emits no cells
	private build(layout: TextLayout, raw: boolean): void {
		let fg = Colour.WHITE;
		let bg = Colour.BLACK;
		let pending: Anchor[] = [];

		for (const [row, piece] of layout.pieces.entries()) {
			const row_map: number[] = [];
			this.visible_to_source[row] = row_map;

			let col = 0;

			const emit = (c: string, source_index: number): void => {
				const char_code = charCodeInCp437(c.codePointAt(0) ?? 32);
				const colour_byte = ((fg & 0xf) << 4) | (bg & 0xf);

				// a space on the all-black colour byte is left as
				// zero, which the shader clips; anything else paints
				if (char_code !== 32 || colour_byte !== 0) {
					this.data[row * this.cols + col] = (colour_byte << 8) | char_code;
				}

				row_map[col] = source_index;
				this.source_to_cell[source_index] = { row, col };
				this.last_source = source_index;

				for (const anchor of pending) {
					anchor.row = row;
					anchor.col = col;
				}

				pending = [];
				col++;
			};

			for (let i = 0; i < piece.length; ) {
				const source_index = layout.source[layout.starts[row] + i]!;

				// raw: every character is a visible cell, escapes
				// included, mapping one-to-one with the source
				if (raw) {
					emit(piece[i]!, source_index);
					i++;
					continue;
				}

				const scan = scanEscapeAt(piece, i);

				if (scan.kind === "anchor") {
					const anchor: Anchor = { options: scan.options, row: 0, col: 0 };
					const group = this.anchors[scan.group] ?? [];

					group.push(anchor);
					this.anchors[scan.group] = group;
					pending.push(anchor);

					i += scan.chars;
					continue;
				}

				if (scan.kind === "colour") {
					// clamp to the dark half; the bright bit is added
					// by the capital form
					const value = Math.min(scan.num, 7) + (scan.bright ? 8 : 0);

					if (scan.attribute === "fg") {
						fg = value;
					} else {
						bg = value;
					}

					i += scan.chars;
					continue;
				}

				const c = piece[i]!;

				// a tab advances to the next tab stop without emitting
				if (c === "\t") {
					const tab_cols = Math.min(
						TAB_WIDTH - (col % TAB_WIDTH),
						Math.max(0, this.cols - col),
					);

					for (let tabbed = col; tabbed < col + tab_cols; tabbed++) {
						row_map[tabbed] = source_index;
					}

					col += tab_cols;
					i++;
					continue;
				}

				emit(c, source_index);
				i += scan.chars;
			}
		}

		// anchors with no following glyph capture the end of the last
		// row, exactly where a cursor there would display
		if (pending.length > 0) {
			const last = Math.max(0, this.rows - 1);

			for (const anchor of pending) {
				anchor.row = last;
				anchor.col = this.rowCols(last);
			}
		}
	}

	/**
	 * The cell that the source character at `index` renders into, or
	 * `null` when it renders nowhere.
	 *
	 * A character renders nowhere when it is inside an escape sequence,
	 * a newline or line continuation, a tab (which advances the column
	 * but emits nothing), a blank consumed by word wrapping, or past
	 * the end of the text.
	 *
	 * @example
	 * ```ts
	 * const g = new Glyphs("ab", 10);
	 *
	 * g.renderedCell(1); // { row: 0, col: 1 }
	 * g.renderedCell(2); // null: past the end
	 * ```
	 *
	 * @param index  Source character index. Out-of-range indices return
	 *               `null`.
	 * @returns     The cell the character renders into, or `null`.
	 */
	renderedCell(index: number): Cell | null {
		const at = this.source_to_cell[index];

		return at === undefined ? null : { ...at };
	}

	/**
	 * Where a text cursor resting at source index `index` displays: the
	 * cell of the next visible character, or the end of the last row
	 * when no visible character follows.
	 *
	 * Escape characters, newlines, tabs, and wrap-consumed blanks have
	 * no cell of their own; a cursor on any of them snaps forward to
	 * the next glyph. This is the query for rendering cursors,
	 * selection endpoints, viewport follow, and anchor placement: on a
	 * zero-width escape it returns exactly the cell that escape's
	 * anchor captured.
	 *
	 * @example
	 * ```ts
	 * const g = new Glyphs("ab\\f1c", 10);
	 *
	 * g.cursorCell(2); // { row: 0, col: 2 }: the escape snaps to "c"
	 * g.cursorCell(9); // { row: 0, col: 3 }: past the end clamps
	 * ```
	 *
	 * @param index  Source character index. Negative indices snap to
	 *               the first visible character; indices past the end
	 *               snap to the end of the last row.
	 * @returns     The cell the cursor displays at.
	 */
	cursorCell(index: number): Cell {
		if (this.rows === 0) {
			return { row: 0, col: 0 };
		}

		const visible = this.source_to_cell[index];

		if (visible !== undefined) {
			return { ...visible };
		}

		for (let i = Math.max(0, index); i < this.source_to_cell.length; i++) {
			const forward = this.source_to_cell[i];

			if (forward !== undefined) {
				return { ...forward };
			}
		}

		const last = this.rows - 1;
		return { row: last, col: this.rowCols(last) };
	}

	/**
	 * The source character index that a click on cell `(row, col)`
	 * targets, clamped the way a text cursor clamps.
	 *
	 * A column past the row's end lands on its last character, a
	 * column before zero lands on its first, a row with no visible
	 * characters continues to the next row's first character, and a
	 * position off the region lands on the last visible character in
	 * it.
	 *
	 * @example
	 * ```ts
	 * const g = new Glyphs("ab", 10);
	 *
	 * g.cursorIndex(0, 0);  // 0
	 * g.cursorIndex(0, 9);  // 1: past the end clamps to the last character
	 * ```
	 *
	 * @param row  The wrapped row within the grid.
	 * @param col  The visible column within the row.
	 * @returns    The source character index under the position.
	 */
	cursorIndex(row: number, col: number): number {
		const row_map = this.visible_to_source[row] ?? [];
		const clamped = row_map[Math.max(0, Math.min(col, row_map.length - 1))];

		if (clamped !== undefined) {
			return clamped;
		}

		// a blank row continues to the next row's first character
		for (let next = row + 1; next < this.rows; next++) {
			const first = this.visible_to_source[next]?.[0];

			if (first !== undefined) {
				return first;
			}
		}

		return Math.max(0, this.last_source);
	}

	/**
	 * The number of visible columns a wrapped row occupies, tabs
	 * expanded.
	 *
	 * Short of `cols` whenever the row broke early; the row's full
	 * display width otherwise. Off-grid rows report `0`.
	 *
	 * @example
	 * ```ts
	 * const g = new Glyphs("ab\tc", 10);
	 *
	 * g.rowCols(0); // 9: "ab" then the tab to column 8, then "c"
	 * g.rowCols(1); // 0
	 * ```
	 *
	 * @param row  The wrapped row within the grid.
	 * @returns    The row's visible column count.
	 */
	rowCols(row: number): number {
		return this.visible_to_source[row]?.length ?? 0;
	}

	/**
	 * A source range as per-row runs of cells, for highlights,
	 * selections, and underlines.
	 *
	 * The half-open range `[start, end)` is resolved to the cells its
	 * visible characters occupy: one {@link CellSpan} per wrapped row,
	 * ordered by row, with runs merged across the zero-width escapes
	 * and tabs inside the range. A range that renders nowhere produces
	 * no spans.
	 *
	 * @example
	 * ```ts
	 * const g = new Glyphs("aaaa bbbb", 5);
	 *
	 * g.spansFor(2, 6);
	 * // [{ row: 0, from: 2, to: 4 }, { row: 1, from: 0, to: 1 }]
	 * ```
	 *
	 * @param start  First source character index of the range.
	 * @param end    One past the last source character index.
	 * @returns     The cell runs the range occupies.
	 */
	spansFor(start: number, end: number): CellSpan[] {
		const spans: CellSpan[] = [];

		const from = Math.max(0, start);
		const to = Math.min(end, this.source_to_cell.length);

		for (let i = from; i < to; i++) {
			const at = this.source_to_cell[i];

			if (at === undefined) {
				continue;
			}

			const last = spans[spans.length - 1];

			// cells appear in row and column order along the source, so
			// the same row always extends the previous run
			if (last !== undefined && last.row === at.row) {
				last.to = at.col + 1;
			} else {
				spans.push({ row: at.row, from: at.col, to: at.col + 1 });
			}
		}

		return spans;
	}

	/**
	 * A copy of the grid with every cell -- optionally only those
	 * within `within` -- replaced by `fn`'s return value.
	 *
	 * Cells never move, so the copy's source text, position mapping,
	 * and anchors all remain exactly valid: it answers every query
	 * identically to the original. This is the way to derive overlay
	 * state (cursor inversion, selection shading, dimming) without
	 * mutating a compiled grid.
	 *
	 * @example
	 * ```ts
	 * const g = new Glyphs("ab", 2);
	 *
	 * // invert the first cell's colours
	 * const inverted = g.mapCells((cell, row, col) =>
	 *     row === 0 && col === 0 ? cell ^ 0xf000 : cell);
	 * ```
	 *
	 * @param fn      Receives each cell's packed value and position;
	 *                returns the replacement value.
	 * @param within  Optional rect limiting which cells are mapped.
	 *                Clamped to the grid; omit to map every cell.
	 * @returns       The transformed copy.
	 */
	mapCells(fn: (cell: number, row: number, col: number) => number, within?: Rect): Glyphs {
		const data = this.data.slice();

		const row_from = Math.max(0, within?.row ?? 0);
		const col_from = Math.max(0, within?.col ?? 0);
		const row_to = Math.min(this.rows, (within?.row ?? this.rows) + (within?.rows ?? this.rows));
		const col_to = Math.min(this.cols, (within?.col ?? this.cols) + (within?.cols ?? this.cols));

		for (let row = row_from; row < row_to; row++) {
			for (let col = col_from; col < col_to; col++) {
				const index = row * this.cols + col;

				data[index] = fn(data[index]!, row, col);
			}
		}

		// the copy shares the compile-time metadata; only data differs
		const copy = Object.create(Glyphs.prototype) as Glyphs;
		Object.assign(copy, this, { data });

		return copy;
	}
}

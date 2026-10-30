import { scanEscapeAt } from "./escape.ts";
import { TAB_WIDTH, layoutText } from "./wrap.ts";
import type { TextLayout, TextOptions } from "./wrap.ts";
import { Colour } from "./colour.ts";
import { charCodeInCp437 } from "./cp437.ts";
import type { Cell, CellSpan } from "./cell.ts";
import type { Rect } from "./rect.ts";

/**
 * A position that tscon text marks for the application, produced by an
 * `\aX` anchor escape sequence.
 *
 * An anchor takes no columns of its own: it marks the cell of the character
 * that follows it, which may be on a later wrapped row, past a tab, or at
 * the end of the last row when nothing follows. `options` is the escape's
 * `{...}` payload, or `null` when the braces are absent or empty.
 *
 * The application decides what each group (0-9) means and what to draw over
 * the marked cell: a link, an image, a heading, anything. See
 * {@link Glyphs.anchors}.
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
 * g.anchors[0]![0]!.index;   // 12: where "F" starts in the source
 * ```
 */
export type Anchor = {
	/** The `{...}` payload, or `null` when absent or empty. */
	options: string | null;
	/** Wrapped row of the captured cell. */
	row: number;
	/** Column of the captured cell. */
	col: number;
	/** Source character index of the captured glyph. */
	index: number;
};

/**
 * Text compiled for the terminal: the wrapped rows, the cells to draw,
 * the anchors the text declares, and the translation between source
 * character indices and cell positions.
 *
 * Compile once per text and width, then read from the result. Blit it with
 * {@link Terminal.blit}, place interactive components at
 * {@link Glyphs.anchors}, and ask where anything went with
 * {@link Glyphs.renderedCell}, {@link Glyphs.cursorCell},
 * {@link Glyphs.cursorIndex}, {@link Glyphs.rowCols},
 * {@link Glyphs.spansFor}, and {@link Glyphs.mapCells}.
 *
 * Positions are region-relative: rows are counted from the top of the grid
 * and columns from its left, the same coordinates {@link Rect} and
 * {@link Terminal.blit} use.
 *
 * @example
 * ```ts
 * import { Glyphs } from "@micahdb/tscon";
 *
 * const g = new Glyphs("hello \\f1world", 80);
 *
 * g.rows;                // 1
 * g.renderedCell(9);     // { row: 0, col: 6 }: where "w" draws
 * g.cursorIndex(0, 6);   // 9: the source character under a click there
 * g.anchors[0];          // \a0 anchors, if the text declared any
 * ```
 */
export class Glyphs {
	/** The source text, exactly as it was given to the constructor. */
	readonly sourceText: string;

	/** The laid-out text: one string per wrapped row, escapes included. */
	readonly wrappedText: string[];

	/**
	 * The cells to draw, row-major with `rows * cols` entries, one 16-bit
	 * value per cell. A cell of `0` is blank and paints nothing when
	 * blitted.
	 */
	readonly data: Uint16Array;

	/** Number of wrapped rows in the grid. */
	readonly rows: number;

	/** Number of columns in the grid. */
	readonly cols: number;

	/**
	 * Anchors keyed by group number (0-9), each list in the order the
	 * anchors appear in the text. Groups with no anchors are absent.
	 */
	readonly anchors: Record<number, Anchor[]>;

	/** Per wrapped row: the source index of each visible column. */
	private readonly visible_to_source: number[][];

	/** Per source character: the cell it renders into, if any. */
	private readonly source_to_cell: (Cell | undefined)[];

	/** Per source character: the cell a cursor resting on it displays at. */
	private readonly source_to_cursor: (Cell | undefined)[];

	/** The source index of the last visible character, or -1 when empty. */
	private last_source: number;

	/**
	 * Compile `text` into a grid of wrapped rows, ready to blit.
	 *
	 * Escape sequences are interpreted: colour escapes recolour the
	 * characters that follow, `\\` draws one backslash, anchors are recorded
	 * in {@link Glyphs.anchors}, and a tab advances to the next multiple of
	 * {@link TAB_WIDTH}. Text starts white-on-black, and characters outside
	 * CP437 draw blank.
	 *
	 * @example
	 * ```ts
	 * import { Glyphs, Wrap } from "@micahdb/tscon";
	 *
	 * const g = new Glyphs("long text", 4, { wrap: Wrap.HARD });
	 *
	 * g.rows;          // 3: "long", " tex", "t"
	 * g.wrappedText;   // ["long", " tex", "t"]
	 * ```
	 *
	 * @param text  The text to compile, possibly with escape sequences.
	 * @param cols  Width of the grid in cells. If `<= 0`, the grid is
	 *              empty.
	 * @param opts  Layout options: how over-long lines break, and whether
	 *              escapes render raw. Defaults to word wrap with escapes
	 *              live.
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
		this.source_to_cursor = [];
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

				const cell = { row, col };

				this.source_to_cell[source_index] = cell;
				this.source_to_cursor[source_index] = cell;
				this.last_source = source_index;

				for (const anchor of pending) {
					anchor.row = row;
					anchor.col = col;
					anchor.index = source_index;
				}

				pending = [];
				col++;
			};

			for (let i = 0; i < piece.length; ) {
				const source_index = layout.source[layout.starts[row] + i]!;

				// raw: every character is visible, escapes
				// included, mapping one-to-one with the source; tabs
				// still advance to the next tab stop
				if (raw && piece[i] === "\t") {
					const tab_cols = Math.min(
						TAB_WIDTH - (col % TAB_WIDTH),
						Math.max(0, this.cols - col),
					);

					for (let tabbed = col; tabbed < col + tab_cols; tabbed++) {
						row_map[tabbed] = source_index;
					}

					this.source_to_cursor[source_index] = { row, col };
					col += tab_cols;
					i++;
					continue;
				}

				if (raw) {
					emit(piece[i]!, source_index);
					i++;
					continue;
				}

				const scan = scanEscapeAt(piece, i);

				if (scan.kind === "anchor") {
					const anchor: Anchor = { options: scan.options, row: 0, col: 0, index: 0 };
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

				// a tab advances to the next tab stop without emitting,
				// but the blank run it advances across belongs to it, so a
				// cursor resting on it sits at the run's first column
				if (c === "\t") {
					const tab_cols = Math.min(
						TAB_WIDTH - (col % TAB_WIDTH),
						Math.max(0, this.cols - col),
					);

					for (let tabbed = col; tabbed < col + tab_cols; tabbed++) {
						row_map[tabbed] = source_index;
					}

					this.source_to_cursor[source_index] = { row, col };
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
				anchor.index = layout.source.length;
			}
		}
	}

	/**
	 * The cell that the source character at `index` draws in, or `null`
	 * when it draws nowhere.
	 *
	 * A character draws nowhere when it belongs to an escape sequence, is a
	 * newline or line continuation, is a tab, is a blank that wrapping
	 * removed, or lies past the end of the text. Ask where a character
	 * appears on screen with this; ask where a cursor sits with
	 * {@link Glyphs.cursorCell}, which never answers "nowhere".
	 *
	 * @example
	 * ```ts
	 * import { Glyphs } from "@micahdb/tscon";
	 *
	 * const g = new Glyphs("ab", 10);
	 *
	 * g.renderedCell(1);   // { row: 0, col: 1 }: the "b"
	 * g.renderedCell(2);   // null: past the end of the text
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
	 * The cell a text cursor resting at source index `index` sits in.
	 *
	 * A character with no cell of its own displays on the next character
	 * that has one, and past the last one at the end of the last row. A tab
	 * is the exception: it displays at the first column of the blank run it
	 * advances across, so moving across a run of tabs steps through that run
	 * instead of sticking to the character that follows it.
	 *
	 * Use this wherever a cursor, a selection endpoint, or a highlight
	 * belongs: on an escape it lands on the character after it, exactly
	 * where the escape's anchor points.
	 *
	 * @example
	 * ```ts
	 * import { Glyphs } from "@micahdb/tscon";
	 *
	 * const g = new Glyphs("ab\\f1c", 10);
	 *
	 * g.cursorCell(2);   // { row: 0, col: 2 }: the escape shows on the "c"
	 * g.cursorCell(9);   // { row: 0, col: 3 }: past the end clamps
	 * ```
	 *
	 * @example
	 * ```ts
	 * import { Glyphs } from "@micahdb/tscon";
	 *
	 * const g = new Glyphs("a\tb", 20);
	 *
	 * g.cursorCell(1);   // { row: 0, col: 1 }: the tab's blank run starts here
	 * g.cursorCell(2);   // { row: 0, col: 8 }: the "b" after the tab stop
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

		const visible = this.source_to_cursor[index];

		if (visible !== undefined) {
			return { ...visible };
		}

		for (let i = Math.max(0, index); i < this.source_to_cursor.length; i++) {
			const forward = this.source_to_cursor[i];

			if (forward !== undefined) {
				return { ...forward };
			}
		}

		const last = this.rows - 1;
		return { row: last, col: this.rowCols(last) };
	}

	/**
	 * The source character index a click on cell `(row, col)` targets,
	 * clamped the way a text cursor clamps.
	 *
	 * A column past a row's end lands on its last character and one before
	 * the start on its first; a row with nothing on it continues to the next
	 * row's first character; a position off the grid lands on the last
	 * character in it.
	 *
	 * This is the reverse of {@link Glyphs.cursorCell}: hand it the cell the
	 * pointer is over and get back the source index to place a cursor at.
	 *
	 * @example
	 * ```ts
	 * import { Glyphs } from "@micahdb/tscon";
	 *
	 * const g = new Glyphs("ab", 10);
	 *
	 * g.cursorIndex(0, 0);   // 0: the "a"
	 * g.cursorIndex(0, 9);   // 1: past the end clamps to the last character
	 * ```
	 *
	 * @example
	 * ```ts
	 * import { Glyphs } from "@micahdb/tscon";
	 *
	 * // a click anywhere in a tab's blank run lands on that tab
	 * const g = new Glyphs("a\tb", 20);
	 *
	 * g.cursorIndex(0, 4);   // 1: inside the tab's run
	 * g.cursorIndex(0, 8);   // 2: the "b" after the tab stop
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
	 * The number of columns a wrapped row fills, tabs expanded.
	 *
	 * Short of `cols` whenever the row ended early, and its full display
	 * width otherwise. Rows outside the grid report `0`.
	 *
	 * Use this to paint a row to its end rather than to the grid edge: a
	 * highlight's last row, an underline, a background bar.
	 *
	 * @example
	 * ```ts
	 * import { Glyphs } from "@micahdb/tscon";
	 *
	 * const g = new Glyphs("ab\tc", 20);
	 *
	 * g.rowCols(0);   // 9: "ab", a tab to column 8, then "c"
	 * g.rowCols(1);   // 0: outside the grid
	 * ```
	 *
	 * @param row  The wrapped row within the grid.
	 * @returns    The row's visible column count.
	 */
	rowCols(row: number): number {
		return this.visible_to_source[row]?.length ?? 0;
	}

	/**
	 * The cells a source range covers, as runs of columns per row.
	 *
	 * The half-open range `[start, end)` becomes one {@link CellSpan} per
	 * wrapped row it touches, ordered by row. Escapes and tabs inside the
	 * range do not split a run, and a range that draws nothing returns no
	 * spans.
	 *
	 * This is the shape highlights want: a search match, a selection, a
	 * syntax span, an underline -- one span to shade per row, even when the
	 * range wraps.
	 *
	 * @example
	 * ```ts
	 * import { Glyphs } from "@micahdb/tscon";
	 *
	 * const g = new Glyphs("aaaa bbbb", 5);
	 *
	 * g.spansFor(2, 6);
	 * // [{ row: 0, from: 2, to: 4 }, { row: 1, from: 0, to: 1 }]
	 * ```
	 *
	 * @example
	 * ```ts
	 * import { Glyphs } from "@micahdb/tscon";
	 *
	 * // escapes inside the range do not split the run
	 * const g = new Glyphs("aa\\f1bb", 20);
	 *
	 * g.spansFor(0, 6);   // [{ row: 0, from: 0, to: 3 }]
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
	 * A copy of the grid with some or all cells replaced.
	 *
	 * `fn` is called with each cell's current value and its position, and
	 * returns the value to draw instead. Only cells inside `within` are
	 * visited; omit it to map every cell. The original grid is left alone,
	 * so a compiled grid can be shared and derived from freely.
	 *
	 * Because cells keep their positions, the copy answers every position
	 * query exactly as the original does: use it to draw overlay state --
	 * a cursor inversion, a selection shade, a dimmed region, a cleared
	 * area -- without disturbing the grid you compiled.
	 *
	 * @example
	 * ```ts
	 * import { Glyphs } from "@micahdb/tscon";
	 *
	 * const g = new Glyphs("hello world", 11);
	 *
	 * // blank the first three cells, so whatever is beneath shows through
	 * const cleared = g.mapCells(
	 *     () => 0,
	 *     { row: 0, col: 0, rows: 1, cols: 3 },
	 * );
	 *
	 * cleared.data[0];   // 0
	 * g.data[0];         // unchanged
	 * ```
	 *
	 * @example
	 * ```ts
	 * import { Glyphs } from "@micahdb/tscon";
	 *
	 * // draw one grid's cells over another's where they are not blank
	 * const base = new Glyphs("base text", 9);
	 * const over = new Glyphs("XXXXX", 9);
	 *
	 * const merged = base.mapCells((cell, row, col) => {
	 *     const overlay = over.data[row * over.cols + col];
	 *
	 *     return overlay === 0 ? cell : overlay;
	 * });
	 * ```
	 *
	 * @param fn      Receives each cell's value and position; returns the
	 *                value to use instead.
	 * @param within  Optional rect limiting which cells are mapped. Clamped
	 *                to the grid; omit to map every cell.
	 * @returns       The transformed copy, with the original's text,
	 *                positions, and anchors.
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

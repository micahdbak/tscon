import { scanEscapeAt } from "./escape.ts";

/**
 * A visible position within laid-out text: the row (the laid-out line, or
 * the wrapped row within it) and the column.
 */
export type ScreenPos = { row: number; col: number };

/**
 * Maps the characters of one logical line of source text (escape
 * sequences included) to the visible positions they occupy after layout,
 * and back.
 *
 * Escape sequences take no visible space: a source character inside an
 * escape maps to the next visible character, and source past the last
 * visible character maps to the end of the last row. Visible positions
 * map back exactly, clamped the way a text cursor clamps: off the ends of
 * a wrapped row lands on its first or last character, and a blank row
 * continues to the next row's first character.
 *
 * Build one per laid-out line:
 *
 * @example
 * ```ts
 * import { TextMap, textToLines } from "@micahdb/tscon";
 *
 * const source = "hello world";
 * const map = new TextMap(source, textToLines(source, 80, true));
 *
 * map.positionAt(10);   // { row: 0, col: 10 }: source character 10
 * map.indexAt(0, 5);    // 5: the source character under the click
 * ```
 */
export class TextMap {
	/** The laid-out pieces the map was built from. */
	readonly pieces: string[];

	/** Per piece: the source character index of each visible column. */
	readonly visible_to_buffer: number[][];

	/** Per source character: the visible position it occupies. */
	readonly buffer_to_visible: (ScreenPos | undefined)[];

	/** The source index of the last visible character, or -1 when empty. */
	last_visible = -1;

	constructor(
		private readonly original: string,
		pieces: string[]
	) {
		this.pieces = pieces;
		this.visible_to_buffer = [];
		this.buffer_to_visible = [];
		this.last_visible = -1;

		this.build();
	}

	// maps the laid-out pieces against the original line. A doubled
	// backslash in the pieces is a neutralized broken anchor (one source
	// character) or an escaped backslash (two).
	private build(): void {
		let buffer_index = 0;

		for (const [row, piece] of this.pieces.entries()) {
			const row_map: number[] = [];
			this.visible_to_buffer[row] = row_map;

			let piece_index = 0;
			let visible_col = 0;

			while (piece_index < piece.length) {
				if (piece[piece_index] === "\\" && piece[piece_index + 1] === "\\") {
					const source_chars = this.original[buffer_index + 1] === "\\" ? 2 : 1;

					row_map[visible_col] = buffer_index;
					this.buffer_to_visible[buffer_index] = { row, col: visible_col };
					this.last_visible = buffer_index;
					visible_col++;

					piece_index += 2;
					buffer_index += source_chars;
					continue;
				}

				const scan = scanEscapeAt(piece, piece_index);

				if (scan.kind === "text") {
					row_map[visible_col] = buffer_index;
					this.buffer_to_visible[buffer_index] = { row, col: visible_col };
					this.last_visible = buffer_index;
					visible_col++;
				}

				piece_index += scan.chars;
				buffer_index += scan.chars;
			}

			// wrapping consumes the blank run at each break, which pieces
			// do not preserve
			if (row + 1 < this.pieces.length) {
				while (buffer_index < this.original.length && (this.original[buffer_index] === " " || this.original[buffer_index] === "\t")) {
					buffer_index++;
				}
			}
		}
	}

	/**
	 * The visible position of a source character: escape characters map to
	 * the next visible character, and past the last one to end of line.
	 *
	 * @param index  Source character index. Indices inside an escape
	 *               sequence, and one past the last character, map to the
	 *               next visible position.
	 * @returns     The row and column the character occupies.
	 */
	positionAt(index: number): ScreenPos {
		const visible = this.buffer_to_visible[index];

		if (visible !== undefined) {
			return { row: visible.row, col: visible.col };
		}

		for (const forward of this.buffer_to_visible.slice(index)) {
			if (forward !== undefined) {
				return { row: forward.row, col: forward.col };
			}
		}

		const last_row = this.pieces.length - 1;
		const last_map = this.visible_to_buffer[last_row];
		return { row: last_row, col: last_map === undefined ? 0 : last_map.length };
	}

	/**
	 * The source character occupying a wrapped row and visible column,
	 * clamped: off the ends of the row lands on its first or last
	 * character, and a blank row continues to the next row's first
	 * character.
	 *
	 * @param row  The wrapped row within the laid-out pieces.
	 * @param col  The visible column within the row; past the row's end
	 *             clamps to the row's last character.
	 * @returns    The source character index under the position.
	 */
	indexAt(row: number, col: number): number {
		const row_map = this.visible_to_buffer[row] ?? [];

		const clamped = row_map[Math.max(0, Math.min(col, row_map.length - 1))];

		if (clamped !== undefined) {
			return clamped;
		}

		const next_map = this.visible_to_buffer[row + 1];

		if (row + 1 < this.pieces.length && next_map !== undefined && next_map[0] !== undefined) {
			return next_map[0]!;
		}

		return Math.max(0, this.last_visible);
	}

	/**
	 * The number of visible characters on a wrapped row.
	 *
	 * @param row  The wrapped row within the laid-out pieces.
	 * @returns    The row's visible length.
	 */
	visibleLength(row: number): number {
		return (this.visible_to_buffer[row] ?? []).length;
	}
}


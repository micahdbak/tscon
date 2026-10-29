import { scanEscapeAt } from "./escape.ts";

/**
 * How lines longer than the column budget are laid out.
 *
 * - `WORD`     -- word-wrap at the most recent space
 * - `TRUNCATE` -- discard the rest of the line
 * - `HARD`     -- break at exactly the budget, ignoring word boundaries
 *
 * @example
 * ```ts
 * import { Wrap, textToLines } from "@micahdb/tscon";
 *
 * textToLines("hello world", 5, { wrap: Wrap.WORD });     // ["hello", "world"]
 * textToLines("hello world", 5, { wrap: Wrap.TRUNCATE }); // ["hello"]
 * textToLines("hello world", 5, { wrap: Wrap.HARD });     // ["hello", " worl", "d"]
 * ```
 */
export enum Wrap {
	WORD = 0,
	TRUNCATE = 1,
	HARD = 2,
}

/**
 * The column width a tab advances to, in cells.
 *
 * A tab in tscon text moves the next character to the next multiple of this
 * width, so tabs line up in columns regardless of what precedes them. Apply
 * the same width when you build equivalent text outside tscon, such as an
 * HTML fallback.
 *
 * @example
 * ```ts
 * import { TAB_WIDTH, Glyphs } from "@micahdb/tscon";
 *
 * // "a" at column 0, a tab stop at column 8, "b" at column 8
 * const g = new Glyphs("a\tb", 80);
 *
 * g.cursorCell(2);      // { row: 0, col: TAB_WIDTH }
 * ```
 */
export const TAB_WIDTH = 8;

/**
 * How text compiles: the layout options shared by {@link textToLines}
 * and the {@link Glyphs} class.
 *
 * @example
 * ```ts
 * import { Glyphs, Wrap } from "@micahdb/tscon";
 *
 * const g = new Glyphs("plain text", 80, { wrap: Wrap.HARD, raw: true });
 * ```
 */
export type TextOptions = {
	/**
	 * How lines longer than `cols` lay out. Default `Wrap.WORD`.
	 */
	wrap?: Wrap;

	/**
	 * Render every escape literally: escapes lose their meaning and lay
	 * out and draw as the raw characters typed. Useful for showing a
	 * text's source, as an editor does while the cursor rests on the
	 * line. Default `false`.
	 */
	raw?: boolean;
};

// the laid-out rows and where each begins, for Glyphs to compile from
export type TextLayout = {
	/** The laid-out visible rows, escapes preserved. */
	pieces: string[];
	/** Index of each piece's first character in the joined text. */
	starts: number[];
	/** Original source index of each remaining source character. */
	source: number[];
};

// the layout pass textToLines and Glyphs share: rows, plus where each one
// begins in the source so positions can be tracked
export function layoutText(
	text: string,
	cols: number,
	opts: TextOptions = {},
): TextLayout {
	if (cols <= 0) {
		return { pieces: [], starts: [], source: [] };
	}

	const raw = opts.raw === true;
	const wrap = opts.wrap ?? Wrap.WORD;

	// continuations join lines before layout; source tracks the original
	// index of every surviving character
	const stripped = stripContinuations(text);

	const laid = wrap === Wrap.HARD
		? hardWrapLines(stripped.text, cols, raw)
		: wrapLines(stripped.text, cols, raw, wrap === Wrap.WORD);

	return {
		pieces: laid.pieces,
		starts: laid.starts,
		source: stripped.source,
	};
}

/**
 * Lay `text` out into lines no wider than `cols` columns, without
 * rendering it.
 *
 * Escapes take no columns (unless `raw` is set), so wrapping counts only the
 * characters a reader sees. Newlines always end a line, and a lone
 * backslash immediately before a newline joins the two lines. Tabs advance
 * to the next multiple of {@link TAB_WIDTH}. Lines longer than `cols` are
 * handled per {@link TextOptions.wrap}.
 *
 * Each returned line still contains its escape sequences, so it can be
 * passed back into tscon or rendered later. Use {@link Glyphs} when you want
 * cells rather than strings.
 *
 * @example
 * ```ts
 * import { textToLines, Wrap } from "@micahdb/tscon";
 *
 * textToLines("hello world", 5);                       // ["hello", "world"]
 * textToLines("hello world", 5, { wrap: Wrap.TRUNCATE }); // ["hello"]
 * textToLines("a\tb", 80);                             // ["a\tb"]
 * ```
 *
 * @param text  The text to lay out, possibly with escape sequences.
 * @param cols  Maximum number of visible columns per line. If `<= 0`, an
 *              empty array is returned.
 * @param opts  Layout options: how over-long lines break, and whether
 *              escapes render raw. Defaults to word wrap, escapes live.
 * @returns     One string per visible line, escapes preserved.
 */
export function textToLines(
	text: string,
	cols: number,
	opts: TextOptions = {},
): string[] {
	return layoutText(text, cols, opts).pieces;
}

/**
 * Removes line continuations -- a lone backslash immediately followed by
 * a newline -- joining the lines around them.
 *
 * `source[i]` records the original index of every surviving character,
 * so positions in the stripped text lift back to the source text.
 */
function stripContinuations(text: string): { text: string; source: number[] } {
	let stripped = "";
	const source: number[] = [];

	for (let i = 0; i < text.length; ) {
		const scan = scanEscapeAt(text, i);

		// a lone backslash before a newline continues the line
		if (scan.kind === "text" && scan.chars === 1 && text[i] === "\\" && text[i + 1] === "\n") {
			i += 2;
			continue;
		}

		for (let c = 0; c < scan.chars; c++) {
			stripped += text[i + c]!;
			source.push(i + c);
		}

		i += scan.chars;
	}

	return { text: stripped, source };
}

/**
 * Skips the blank run beginning at `start` (plus one following newline)
 * and returns the index of its last character, or -1 when the run
 * reaches the end of the text.
 */
function skipBlankRun(text: string, start: number): number {
	while (start < text.length && (text[start] === " " || text[start] === "\t")) {
		start++;
	}

	// just in case there was a newline
	if (start < text.length && text[start] === "\n") {
		start++;
	}

	// reached the end of text
	if (start >= text.length) {
		return -1;
	}

	// return index of last blank
	return start - 1;
}

// a laid-out text: pieces and their offsets in the text given
interface Laid {
	pieces: string[];
	starts: number[];
}

// the word-wrap and truncate modes share this line-breaking walk: escapes
// take no columns, and each visible character either fits, breaks the
// line, or ends it. Pieces stay verbatim slices, so every break records
// the offset it starts at
function wrapLines(
	text: string,
	cols: number,
	raw: boolean,
	word_wrap: boolean,
): Laid {
	const pieces: string[] = [];
	const starts: number[] = [];

	const breakLine = (from: number, to: number): void => {
		pieces.push(text.slice(from, to).trimEnd());
		starts.push(from);
	};

	let start = 0;
	let used = 0;
	let last_space = -1;

	for (let i = 0; i < text.length; i++) {
		let c = text[i]!;

		if (!raw) {
			const scan = scanEscapeAt(text, i);

			// escapes take no columns: skip past them uncounted
			if (scan.kind !== "text") {
				i += scan.chars - 1;
				continue;
			}

			// an escaped backslash displays one character
			if (scan.chars === 2) {
				i++;
				c = text[i]!;
			}
		}

		// newline
		if (c === "\n") {
			breakLine(start, i);

			start = i + 1;
			used = 0;
			last_space = -1;

			continue;
		}

		// tab
		if (c === "\t") {
			const tab_cols = TAB_WIDTH - (used % TAB_WIDTH);

			if (used + tab_cols > cols) {
				breakLine(start, i);

				const next = word_wrap ? skipBlankRun(text, i + 1) : text.indexOf("\n", i + 1);

				// end of text: the line was cut, nothing follows
				if (next < 0) {
					return { pieces, starts };
				}

				i = next;
				start = next + 1;
				used = 0;
				last_space = -1;
			} else {
				used += tab_cols;
				last_space = i;
			}

			continue;
		}

		// space
		if (c === " ") {
			last_space = i;
		}

		// exceeding available width
		if (used + 1 > cols) {
			// skip rest of line if not wrapping
			if (!word_wrap) {
				breakLine(start, i);

				const next = text.indexOf("\n", i + 1);

				// end of text: the line was truncated, nothing follows
				if (next < 0) {
					return { pieces, starts };
				}

				i = next;
				start = next + 1;
				used = 0;
				last_space = -1;

				continue;
			}

			// this is a continuous word that filled the whole line
			if (last_space < 0) {
				breakLine(start, i);

				start = i;
				used = 0;
				i--;

				continue;
			}

			// otherwise, will break at last space

			breakLine(start, last_space);

			i = skipBlankRun(text, last_space);
			start = i + 1;
			used = 0;
			last_space = -1;

			continue;
		}

		used++;
	}

	// push last line if it isn't empty; trailing whitespace is content
	// here and survives
	if (start < text.length) {
		pieces.push(text.slice(start));
		starts.push(start);
	}

	return { pieces, starts };
}

// the hard mode: rows of exactly `cols` visible characters, zero-width
// escapes attached to the visible character they precede. Raw mode is
// the same walk with every character visible
function hardWrapLines(text: string, cols: number, raw: boolean): Laid {
	const pieces: string[] = [];
	const starts: number[] = [];
	let line = "";
	let line_start = 0;
	let used = 0;
	let pending = "";

	for (let i = 0; i < text.length; ) {
		const c = text[i]!;

		// newlines always break lines; escapes already pending stay on
		// their line
		if (c === "\n") {
			pieces.push(line + pending);
			starts.push(line_start);
			line = "";
			pending = "";
			used = 0;
			line_start = i + 1;
			i++;
			continue;
		}

		// raw mode: every character is a visible column, escapes included
		if (raw) {
			if (used === cols) {
				pieces.push(line);
				starts.push(line_start);
				line = "";
				used = 0;
				line_start = i;
			}

			line += c;
			used++;
			i++;
			continue;
		}

		const scan = scanEscapeAt(text, i);
		const chunk = text.slice(i, i + scan.chars);

		// a zero-width escape waits to join the row of the visible
		// character it precedes
		if (scan.kind !== "text") {
			pending += chunk;
			i += scan.chars;
			continue;
		}

		// a visible character at the budget breaks the row; pending
		// escapes move with it to the new row
		if (used === cols) {
			pieces.push(line);
			starts.push(line_start);
			line_start = i - pending.length;
			line = pending;
			pending = "";
			used = 0;
		} else {
			line += pending;
			pending = "";
		}

		line += chunk;
		used++;
		i += scan.chars;
	}

	if (line !== "" || pending !== "" || pieces.length === 0) {
		pieces.push(line + pending);
		starts.push(line_start);
	}

	return { pieces, starts };
}

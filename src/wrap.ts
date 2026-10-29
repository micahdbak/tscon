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
 * Number of columns a tab advances the cursor by.
 *
 * Tabs in text processed by {@link textToLines} and {@link Glyphs}
 * advance the column position to the next multiple of this width.
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

/**
 * The result of laying text out: one string per wrapped row, plus the
 * mapping back to the source text.
 *
 * Each piece is a verbatim slice of the continuation-stripped text
 * (escape sequences included, trailing blanks trimmed only where
 * wrapping consumed them), so `pieces[r][i]` is the stripped character
 * at `starts[r] + i`, and `source[stripped_index]` is its index in the
 * original text.
 *
 * @example
 * ```ts
 * import { layoutText } from "@micahdb/tscon";
 *
 * layoutText("hello world", 5);
 * // { pieces: ["hello", "world"], starts: [0, 6], source: [0, 1, ...] }
 * ```
 */
export type TextLayout = {
	/** The laid-out visible rows, escapes preserved. */
	pieces: string[];
	/** Index of each piece's first character in the stripped text. */
	starts: number[];
	/** Original source index of every character of the stripped text. */
	source: number[];
};

/**
 * Lay `text` out into rows no wider than `cols` columns, tracking where
 * each row begins in the source.
 *
 * This is the full-layout pass the {@link Glyphs} class compiles from.
 * Line continuations join first; escape sequences are interpreted by
 * {@link scanEscapeAt} and take no columns (unless `raw` is set).
 *
 * @example
 * ```ts
 * import { layoutText } from "@micahdb/tscon";
 *
 * layoutText("hello world", 5);
 * // { pieces: ["hello", "world"], starts: [0, 6] }
 * ```
 *
 * @param text  The text to lay out, possibly with escape sequences.
 * @param cols  Maximum number of visible columns per row. If `<= 0`, no
 *              rows are produced.
 * @param opts  Layout options: how over-long lines break, and whether
 *              escapes render raw. Defaults to word wrap, escapes live.
 * @returns     The pieces and their source offsets.
 */
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
 * Lay `text` out into lines no wider than `cols` columns.
 *
 * This is the line-breaking pass used by the {@link Glyphs} class: it
 * interprets the tscon text escape sequences so they take no columns
 * (unless `raw` is set) and returns the visible content of each line as
 * a string, escapes preserved for later processing.
 *
 * Newlines always break the line. A lone backslash immediately followed
 * by a newline is a line continuation: both characters are removed and
 * the following content joins the current line. Tabs advance to the
 * next multiple of {@link TAB_WIDTH}.
 *
 * With `wrap` of `Wrap.WORD`, lines longer than `cols` break at the
 * most recent space (or mid-word when a single word fills a whole
 * line). `Wrap.TRUNCATE` discards the rest of the line instead, and
 * `Wrap.HARD` breaks at exactly `cols` visible characters regardless of
 * word boundaries.
 *
 * @example
 * ```ts
 * import { textToLines } from "@micahdb/tscon";
 *
 * textToLines("hello world", 5);   // ["hello", "world"]
 * ```
 *
 * @param text  The text to lay out, possibly with escape sequences.
 * @param cols  Maximum number of visible columns per line. If `<= 0`, an
 *              empty array is returned.
 * @param opts  Layout options: how over-long lines break, and whether
 *              escapes render raw. Defaults to word wrap, escapes live.
 * @returns     The laid-out visible lines, with escape sequences preserved.
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

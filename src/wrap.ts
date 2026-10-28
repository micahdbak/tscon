import { scanEscapeAt } from "./escape.ts";

/**
 * How lines longer than the column budget are laid out.
 *
 * - `true`  -- word-wrap at the most recent space
 * - `false` -- truncate
 * - `"hard"` -- break at exactly the budget, ignoring word boundaries
 *
 * The booleans keep the original `textToLines`/`textGlyphs` signatures
 * source-compatible.
 */
export type Wrap = boolean | "hard";

/**
 * Number of columns a tab advances the cursor by.
 *
 * Tabs in text processed by {@link textToLines} and {@link textGlyphs}
 * advance the column position to the next multiple of this width.
 */
export const TAB_WIDTH = 8;

/**
 * Skips the blank run beginning at `start` (plus one following newline)
 * and returns the index of its last character, or -1 when the run reaches
 * the end of the text.
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

/**
 * Layout `text` into lines no wider than `cols` columns.
 *
 * This is the line-breaking pass used by {@link textGlyphs}. It interprets
 * the tscon text escape sequences (see {@link scanEscapeAt}) so they are
 * not counted against the column budget, and returns the raw visible
 * content of each line as a string (still containing the escape codes for
 * later processing).
 *
 * Newlines always break the line. A backslash immediately followed by a
 * newline is a line continuation: the two characters are removed and the
 * following content joins the current line. Tabs advance to the next
 * multiple of {@link TAB_WIDTH}.
 *
 * When `wrap` is `true`, lines longer than `cols` are wrapped at the most
 * recent space (or broken mid-word if a single word fills a whole line).
 * When `wrap` is `false`, lines longer than `cols` are truncated at the
 * end of the line and the rest of that logical line is discarded. When
 * `wrap` is `"hard"`, lines break at exactly `cols` visible characters
 * with no regard for word boundaries.
 *
 * @example
 * ```ts
 * import { textToLines } from "@micahdb/tscon";
 *
 * textToLines("hello world", 80, true);   // ["hello world"]
 * textToLines("hello world", 5, true);    // ["hello", "world"]
 * textToLines("hello world", 5, false);   // ["hello"]
 * textToLines("hello world", 5, "hard");  // ["hello", " worl", "d"]
 * ```
 *
 * @param text  The text to lay out, possibly with escape sequences.
 * @param cols  Maximum number of visible columns per line. If `<= 0`, an
 *              empty array is returned.
 * @param wrap  How to lay out lines longer than `cols`: `true` word-wraps
 *              them, `false` truncates them, `"hard"` breaks them at
 *              exactly `cols` characters.
 * @returns     The laid-out visible lines, with escape sequences preserved.
 */
export function textToLines(text: string, cols: number, wrap: Wrap): string[] {
	if (cols <= 0) {
		return [];
	}

	// "text that breaks \
	// a line into two"
	// ->
	// "text that breaks a line into two"
	text = text.replaceAll("\\\n", "");

	if (wrap === "hard") {
		return hardWrapLines(text, cols);
	}

	return wrapLines(text, cols, wrap);
}

// the word-wrap and truncate modes share this line-breaking walk: escapes
// take no columns, and each visible character either fits, breaks the
// line, or ends it
function wrapLines(text: string, cols: number, wrap: boolean): string[] {
	const lines: string[] = [];
	const at = { start: 0, used: 0, last_space: -1 };

	for (let i = 0; i < text.length; i++) {
		const scan = scanEscapeAt(text, i);

		// escapes take no columns: skip past them uncounted
		if (scan.kind !== "text") {
			i += scan.chars - 1;
			continue;
		}

		// an escaped backslash displays one character
		if (scan.chars === 2) {
			i++;
		}

		const c = text[i]!;

		// newline
		if (c === "\n") {
			lines.push(text.slice(at.start, i).trimEnd());

			at.start = i + 1;
			at.used = 0;
			at.last_space = -1;

			continue;
		}

		// tab
		if (c === "\t") {
			const tab_cols = TAB_WIDTH - (at.used % TAB_WIDTH);

			if (at.used + tab_cols > cols) {
				lines.push(text.slice(at.start, i).trimEnd());

				const next = wrap ? skipBlankRun(text, i + 1) : text.indexOf("\n", i + 1);

				// end of text: the line was cut, nothing follows
				if (next < 0) {
					return lines;
				}

				i = next;
				at.start = next + 1;
				at.used = 0;
				at.last_space = -1;
			} else {
				at.used += tab_cols;
				at.last_space = i;
			}

			continue;
		}

		// space
		if (c === " ") {
			at.last_space = i;
		}

		// exceeding available width
		if (at.used + 1 > cols) {
			// skip rest of line if not wrapping
			if (!wrap) {
				lines.push(text.slice(at.start, i).trimEnd());

				const next = text.indexOf("\n", i + 1);

				// end of text: the line was truncated, nothing follows
				if (next < 0) {
					return lines;
				}

				i = next;
				at.start = next + 1;
				at.used = 0;
				at.last_space = -1;

				continue;
			}

			// this is a continuous word that filled the whole line
			if (at.last_space < 0) {
				lines.push(text.slice(at.start, i).trimEnd());

				at.start = i;
				at.used = 0;
				i--;

				continue;
			}

			// otherwise, will break at last space

			lines.push(text.slice(at.start, at.last_space).trimEnd());

			i = skipBlankRun(text, at.last_space);
			at.start = i + 1;
			at.used = 0;
			at.last_space = -1;

			continue;
		}

		at.used++;
	}

	// push last line if it isn't a space
	if (at.start < text.length) {
		lines.push(text.slice(at.start));
	}

	return lines;
}

// the hard mode: rows of exactly `cols` visible characters, zero-width
// escapes attached to the visible character they precede
function hardWrapLines(text: string, cols: number): string[] {
	const lines: string[] = [];
	let line = "";
	let used = 0;
	let pending = "";

	for (let i = 0; i < text.length; ) {
		const scan = scanEscapeAt(text, i);
		const chunk = text.slice(i, i + scan.chars);

		// newlines always break lines; escapes already pending stay on
		// their line
		if (scan.kind === "text" && chunk === "\n") {
			lines.push(line + pending);
			line = "";
			used = 0;
			pending = "";
			i++;
			continue;
		}

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
			lines.push(line);
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

	if (line !== "" || pending !== "" || lines.length === 0) {
		lines.push(line + pending);
	}

	return lines;
}

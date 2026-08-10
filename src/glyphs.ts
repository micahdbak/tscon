import { Colour } from "./colour.ts";
import { charCodeInCp437 } from "./cp437.ts";

/**
 * Number of columns a tab advances the cursor by.
 *
 * Tabs in text processed by {@link textToLines} and {@link textGlyphs}
 * advance the column position to the next multiple of this width.
 */
export const TAB_WIDTH = 8;

function finalSpaceIdx(text: string, start: number): number {
	// skip remaining white space
	while (
		start < text.length &&
		(text[start] === " " || text[start] === "\t")
	) {
		start++;
	}

	// just incase there was a newline
	if (start < text.length && text[start] === "\n") {
		start++;
	}

	// reached the end of text
	if (start >= text.length) {
		return -1;
	}

	// return index of last space
	return start - 1;
}

/**
 * Layout `text` into lines no wider than `cols` columns.
 *
 * This is the line-breaking pass used by {@link textGlyphs}. It interprets
 * the tscon text escape sequences so they are not counted against the
 * column budget, and returns the raw visible content of each line as a
 * string (still containing the escape codes for later processing).
 *
 * The following escape sequences are recognised and treated as taking up
 * zero columns:
 *
 * - `\\` -- a literal backslash (collapses to one displayed char)
 * - `\aX` and `\aX{options}` -- an anchor in group `X` (0-9), with an
 *   optional `{...}` options string
 * - `\fX` / `\FX` -- set foreground to colour `X` (dark / bright)
 * - `\bX` / `\BX` -- set background to colour `X` (dark / bright)
 *
 * Newlines always break the line. A backslash immediately followed by a
 * newline is a line continuation: the two characters are removed and the
 * following content joins the current line. Tabs advance to the next
 * multiple of {@link TAB_WIDTH}.
 *
 * When `wrap` is `true`, lines longer than `cols` are wrapped at the most
 * recent space (or broken mid-word if a single word fills a whole line).
 * When `wrap` is `false`, lines longer than `cols` are truncated at the
 * end of the line and the rest of that logical line is discarded.
 *
 * @example
 * ```ts
 * import { textToLines } from "@creat/tscon";
 *
 * textToLines("hello world", 80, true);   // ["hello world"]
 * ```
 *
 * @param text  The text to lay out, possibly with escape sequences.
 * @param cols  Maximum number of visible columns per line. If `<= 0`, an
 *              empty array is returned.
 * @param wrap  Whether to word-wrap long lines (`true`) or truncate them
 *              (`false`).
 * @returns     The laid-out visible lines, with escape sequences preserved.
 */
export function textToLines(
	text: string,
	cols: number,
	wrap: boolean,
): string[] {
	const lines: string[] = [];

	if (cols <= 0) {
		return lines; // empty
	}

	let start = 0;
	let running_cols = 0;
	let last_space = -1;

	// "text that breaks \
	// a line into two"
	// ->
	// "text that breaks a line into two"
	text = text.replaceAll("\\\n", "");

	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		let escape = c === "\\";

		// single back slash
		if (escape && i + 1 < text.length && text[i + 1] === "\\") {
			i++; // skip one character
			escape = false;
		}

		// anchor escape sequence
		// \aX                 : anchor in group X, no options
		// \aX{options string} : anchor in group X, with options
		if (
			escape && i + 2 < text.length && text[i + 1] === "a" &&
			!isNaN(Number(text[i + 2]))
		) {
			let skip_chars = 2;

			// options string
			if (i + 3 < text.length && text[i + 3] === "{") {
				const closing_brace = text.indexOf("}", i + 3);

				if (closing_brace > i + 3) {
					// skip right until the closing brace
					skip_chars = closing_brace - i;
				} // else, no matching closing brace, ignore "{"
			}

			i += skip_chars;

			continue; // i++
		}

		// colours escape sequence
		// \fX : set foreground to X, dark
		// \FX : set foreground to X, bright
		// \bX : set background to X, dark
		// \BX : set background to X, bright
		if (
			escape &&
			i + 2 < text.length &&
			"fFbB".includes(text[i + 1]) &&
			!isNaN(Number(text[i + 2]))
		) {
			// skip the 3 char combo
			i += 2;

			continue; // i++
		}

		// newline
		if (c === "\n") {
			lines.push(text.slice(start, i).trimEnd());

			start = i + 1;
			running_cols = 0;
			last_space = -1;

			continue;
		}

		// tab
		if (c === "\t") {
			const cols_to_tab = TAB_WIDTH -
				(running_cols % TAB_WIDTH);

			if (running_cols + cols_to_tab > cols) {
				lines.push(text.slice(start, i).trimEnd());

				if (!wrap) {
					i = text.indexOf("\n", i + 1);
				} else {
					i = finalSpaceIdx(text, i + 1);
				}

				// end of text
				if (i < 0) {
					break;
				}

				start = i + 1;
				running_cols = 0;
				last_space = -1;
			} else {
				running_cols += cols_to_tab;
				last_space = i;
			}

			continue;
		}

		// space
		if (c === " ") {
			last_space = i;
		}

		// exceeding available width
		if (running_cols + 1 > cols) {
			// skip rest of line if not wrapping
			if (!wrap) {
				lines.push(text.slice(start, i).trimEnd());

				i = text.indexOf("\n", i + 1);

				// end of text
				if (i < 0) {
					break;
				}

				start = i + 1;
				running_cols = 0;
				last_space = -1;

				continue;
			}

			// this is a continuous word that filled the whole line
			if (last_space < 0) {
				lines.push(text.slice(start, i).trimEnd());

				start = i;
				running_cols = 0;
				i--;

				continue;
			}

			// otherwise, will break at last space

			lines.push(text.slice(start, last_space).trimEnd());

			i = finalSpaceIdx(text, last_space);
			start = i + 1;
			running_cols = 0;
			last_space = -1;

			continue;
		}

		running_cols++;
	}

	// push last line if it isn't a space
	if (start < text.length) {
		lines.push(text.slice(start));
	}

	return lines;
}

/**
 * A named position inside a {@link Glyphs} block, produced by an `\aX`
 * anchor escape sequence in the source text.
 *
 * Anchors are grouped by the single digit `X` (0-9) following the `\a`
 * escape, and the position recorded is the row/column of the glyph the
 * anchor precedes. The optional `{...}` payload becomes {@link options}.
 *
 * They are how the text format marks interactive or navigable points
 * (links, section headings, image placements, etc.) that the application
 * can later find and render -- for example link text + URL or a section hash.
 */
export type Anchor = {
	/**
	 * The text inside the anchor's optional `{...}` payload, or `null` if
	 * the anchor had no payload (or an empty payload, which is treated as
	 * `null`). Conventions like `"text|url"` are defined by the caller.
	 */
	options: string | null;
	/** Row (y) of the anchor within the glyph grid. */
	row: number;
	/** Column (x) of the anchor within the glyph grid. */
	col: number;
};

/**
 * A grid of pre-rendered terminal glyphs produced by {@link textGlyphs}.
 *
 * Each cell is a single 16-bit value packing a CP437 character code in the
 * low byte and a 4-bit foreground / 4-bit background colour pair in the
 * high byte: `[ fg (4) | bg (4) | char_code (8) ]`. Colours are indices into
 * {@link PALETTE} (see {@link Colour}). Cells that are blank (a space on
 * the default black-on-black colour) are left as zero.
 *
 * `data` is laid out row-major with `rows * cols` entries, so the glyph at
 * `(row, col)` is at index `row * cols + col`.
 *
 * {@link anchors} records the positions of every `\aX` anchor found while
 * rendering, keyed by group number 0-9.
 *
 * Pass a `Glyphs` to {@link Terminal.blit} to copy it onto the console's
 * framebuffer.
 */
export type Glyphs = {
	/** Packed glyph data, length `rows * cols`, row-major. */
	data: Uint16Array;
	/** Number of rows in the grid. */
	rows: number;
	/** Number of columns in the grid. */
	cols: number;
	/**
	 * Anchors keyed by group number (0-9). Each value is the list of
	 * anchors in that group, in the order they appear in the text.
	 */
	anchors: Record<number, Anchor[]>;
};

/**
 * Render `text` into a grid of terminal glyphs `cols` wide.
 *
 * This is the primary text-rendering entry point. It runs {@link textToLines}
 * to lay the text out, then encodes each visible character as a packed
 * 16-bit glyph (CP437 code + colour pair) into the resulting {@link Glyphs}.
 *
 * The escape sequences understood by the text format are interpreted here:
 *
 * - `\\` -- emits a single literal backslash
 * - `\aX` / `\aX{options}` -- records an anchor in group `X` (0-9) at the
 *   current position, with optional `options` string (see {@link Anchor})
 * - `\fX` / `\FX` -- set foreground colour to `X` (dark / bright)
 * - `\bX` / `\BX` -- set background colour to `X` (dark / bright)
 *
 * Colours `X` are clamped to 0-7; the `F`/`B` (capital) variants add 8 to
 * select the bright half of the palette. The initial foreground is
 * {@link Colour.WHITE} and the initial background is {@link Colour.BLACK}.
 *
 * Tabs advance the column to the next multiple of {@link TAB_WIDTH} but
 * do not emit anything. Characters outside the CP437 range map to 0
 * (blank), and trailing space on the default colour is left as zero so it
 * does not overwrite whatever is already on the console.
 *
 * @example
 * ```ts
 * import { textGlyphs } from "@creat/tscon";
 *
 * // bright-blue on black "Link", 4 cols wide
 * const g = textGlyphs("\\F4\\b0Link", 4, false);
 * ```
 *
 * @param text  The text to render, with escape sequences.
 * @param cols  Width of the grid in cells. If `<= 0`, an empty grid is
 *              returned.
 * @param wrap  Whether to word-wrap long lines (`true`) or truncate them
 *              (`false`).
 * @returns     The rendered glyph grid, with anchors populated.
 */
export function textGlyphs(text: string, cols: number, wrap: boolean): Glyphs {
	if (cols <= 0) {
		return {
			data: new Uint16Array(),
			rows: 0,
			cols: 0,
			anchors: {},
		};
	}

	const lines = textToLines(text, cols, wrap);
	const rows = lines.length;

	if (rows === 0) {
		return {
			data: new Uint16Array(),
			rows: 0,
			cols: 0,
			anchors: {},
		};
	}

	const glyphs = {
		data: new Uint16Array(rows * cols),
		rows,
		cols: cols,
		anchors: {} as Record<number, Anchor[]>,
	};

	let fg: number = Colour.WHITE;
	let bg: number = Colour.BLACK;

	for (let row = 0; row < rows; row++) {
		const line = lines[row];
		let col = 0;

		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			let escape = c === "\\";

			// \\ : display a single back slash
			if (
				escape && i + 1 < line.length &&
				line[i + 1] === "\\"
			) {
				i++; // this will be displayed as a single character
				escape = false; // skip below checks
			}

			// anchor escape sequence
			// \aX                 : anchor in group X, no options
			// \aX{options string} : anchor in group X, with options
			if (
				escape && i + 2 < line.length &&
				line[i + 1] === "a" &&
				!isNaN(Number(line[i + 2]))
			) {
				const num = Math.max(
					Math.min(Number(line[i + 2]), 9),
					0,
				); // 0..9
				let skip_chars = 2;

				if (glyphs.anchors[num] === undefined) {
					glyphs.anchors[num] = [];
				}

				const anchors = glyphs.anchors[num] as Anchor[];
				let options = null;

				// options string
				if (
					i + 4 <= line.length &&
					line[i + 3] === "{"
				) {
					const closing_brace = line.indexOf(
						"}",
						i + 3,
					);

					if (closing_brace > i + 3) {
						// \aX{options} <- take text from inner braces
						options = line.slice(
							i + 4,
							closing_brace,
						);

						// skip right until the closing brace
						skip_chars = closing_brace - i;
					} // else, options = null
				}

				// empty string should be null
				if (options === "") {
					options = null;
				}

				anchors.push({ options, row, col });

				i += skip_chars;

				continue; // i++
			}

			// colour escape sequence:
			// \fX : foreground X, dark
			// \FX : foreground X, bright
			// \bX : background X, dark
			// \BX : background X, bright
			if (
				escape &&
				i + 2 < line.length &&
				"fFbB".includes(line[i + 1]) &&
				!isNaN(Number(line[i + 2]))
			) {
				const num = Math.max(
					Math.min(Number(line[i + 2]), 7),
					0,
				); // 0..7

				switch (line[i + 1]) {
					case "f":
						fg = num;

						break;

					case "F":
						fg = num + 8;

						break;

					case "b":
						bg = num;

						break;

					case "B":
						bg = num + 8;

						break;
				}

				i += 2;

				continue;
			}

			// tab
			if (c === "\t") {
				const tab_chars = TAB_WIDTH - (col % TAB_WIDTH);
				col += tab_chars;

				continue;
			}

			if (col + 1 > cols) {
				// in theory, shouldn't happen; but be safe if it does
				break;
			}

			const char_code = charCodeInCp437(
				line.codePointAt(i) ?? " ".codePointAt(0)!,
			);
			const colour_byte = ((fg & 0b1111) << 4) |
				(bg & 0b1111);

			if (
				char_code !== " ".codePointAt(0) ||
				colour_byte !== 0
			) {
				const data_idx = row * cols + col;

				const glyph = (colour_byte << 8) |
					(char_code & 0xff);

				glyphs.data[data_idx] = glyph;
			}

			col++;
		}
	}

	return glyphs;
}

/**
 * How each cell of a {@link TexGlyphs} grid samples its source texture.
 *
 * The value is packed into each texture-glyph and read by the renderer's
 * vertex shader to decide, per cell, how to turn the source texture into a
 * drawn glyph.
 *
 * - `SAMPLE`    -- render the source texture directly. Each cell is given UV
 *                  coordinates into the texture, so the full rendered region
 *                  simply shows the source texture as-is.
 * - `GLYPHS`    -- sample the texture and convert it to a glyph: the
 *                  character is chosen by the sample's brightness and the
 *                  colour by dithering (Bayer matrix + nearest palette hue).
 *                  The background stays black. Preferred when you want the
 *                  texture rendered as coloured characters without it being
 *                  too bright or jarring.
 * - `BG_GLYPHS` -- like `GLYPHS`, but also sets the background colour, so
 *                  the full glyph (foreground + background) carries more of
 *                  the sample's colour. This is noticeably brighter and more
 *                  visually accurate; use it when no text is drawn on top of
 *                  the rendered texture.
 * - `MIX`       -- alternate `SAMPLE`/`GLYPHS` in a checkerboard pattern.
 * - `ROWS`      -- alternate `SAMPLE`/`GLYPHS` by row.
 * - `COLS`      -- alternate `SAMPLE`/`GLYPHS` by column.
 */
export enum TexGlyphMode {
	SAMPLE = 0,
	GLYPHS = 1,
	BG_GLYPHS = 2,
	MIX = 3,
	ROWS = 4,
	COLS = 5,
}

/**
 * A grid of texture-sampling descriptors produced by {@link textureGlyphs}
 * and consumed by {@link Renderer.draw}.
 *
 * Each cell is a 32-bit value packing the cell's row, its {@link TexGlyphMode},
 * and its column: `[ row (8) | mode (8) | col (16) ]`.
 *
 * `data` is laid out row-major with `rows * cols` entries.
 */
export type TexGlyphs = {
	/** Packed texture-glyph data, length `rows * cols`, row-major. */
	data: Uint32Array;
	/** Number of rows in the grid. */
	rows: number;
	/** Number of columns in the grid. */
	cols: number;
};

/**
 * Build a {@link TexGlyphs} grid of `rows` by `cols` cells that samples a
 * texture in the given {@link TexGlyphMode}.
 *
 * The grid is sized to match a region of the terminal (typically the whole
 * canvas, `canvas.rows` x `canvas.cols`, or a smaller sub-region) and is
 * passed to {@link Renderer.draw} along with the texture to display.
 *
 * For the `MIX`, `ROWS`, and `COLS` modes the requested `mode` is used as a
 * base and individual cells are switched between `SAMPLE` and `GLYPHS`
 * according to the pattern (see {@link TexGlyphMode} for what each mode does
 * to the sampled texture). The packed per-cell value encodes the cell's own
 * row/column and the (possibly per-cell) effective mode.
 *
 * @example
 * ```ts
 * import { TexGlyphMode, textureGlyphs } from "@creat/tscon";
 *
 * // whole-canvas glyphs that sample the texture as coloured characters
 * const tg = textureGlyphs(canvas.rows, canvas.cols, TexGlyphMode.GLYPHS);
 * ```
 *
 * @param rows  Height of the grid in cells.
 * @param cols  Width of the grid in cells.
 * @param mode  Sampling mode to apply to the cells.
 * @returns     The packed texture-glyph grid.
 */
export function textureGlyphs(
	rows: number,
	cols: number,
	mode: TexGlyphMode,
): TexGlyphs {
	const tglyphs = {
		data: new Uint32Array(rows * cols),
		rows,
		cols,
	};

	const global_mode = mode;

	for (let data_idx = 0; data_idx < rows * cols; data_idx++) {
		const row = Math.floor(data_idx / cols);
		const col = data_idx % cols;

		if (global_mode == TexGlyphMode.MIX) {
			mode = (row + col) % 2 == 0
				? TexGlyphMode.SAMPLE
				: TexGlyphMode.GLYPHS;
		} else if (global_mode == TexGlyphMode.ROWS) {
			mode = row % 2 == 0
				? TexGlyphMode.SAMPLE
				: TexGlyphMode.GLYPHS;
		} else if (global_mode == TexGlyphMode.COLS) {
			mode = col % 2 == 0
				? TexGlyphMode.SAMPLE
				: TexGlyphMode.GLYPHS;
		}

		const glyph = ((row & 0xff) << 24) | ((mode & 0xff) << 16) |
			(col & 0xffff);

		tglyphs.data[data_idx] = glyph;
	}

	return tglyphs;
}

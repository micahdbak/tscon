import { scanEscapeAt } from "./escape.ts";
import type { EscapeScan } from "./escape.ts";
import { TAB_WIDTH, textToLines } from "./wrap.ts";
import type { Wrap } from "./wrap.ts";
import { Colour } from "./colour.ts";
import { charCodeInCp437 } from "./cp437.ts";

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
 * A cell left as zero is blank: the shader clips its quad entirely, so
 * whatever was drawn beneath shows through. Characters on the all-zero
 * colour byte render as the default white-on-black.
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

type ColourState = { fg: number; bg: number };

function emptyGlyphs(): Glyphs {
	return {
		data: new Uint16Array(),
		rows: 0,
		cols: 0,
		anchors: {},
	};
}

function recordAnchor(
	glyphs: Glyphs,
	group: number,
	options: string | null,
	row: number,
	col: number,
): void {
	const anchors = glyphs.anchors[group] ?? [];

	anchors.push({ options, row, col });
	glyphs.anchors[group] = anchors;
}

function applyColour(colours: ColourState, scan: Extract<EscapeScan, { kind: "colour" }>): void {
	// clamp to the dark half; the bright bit is added by the capital form
	const value = Math.min(scan.num, 7) + (scan.bright ? 8 : 0);

	if (scan.attribute === "fg") {
		colours.fg = value;
	} else {
		colours.bg = value;
	}
}

/**
 * Render `text` into a grid of terminal glyphs `cols` wide.
 *
 * This is the primary text-rendering entry point. It runs {@link textToLines}
 * to lay the text out, then encodes each visible character as a packed
 * 16-bit glyph (CP437 code + colour pair) into the resulting {@link Glyphs}.
 *
 * The escape sequences understood by the text format are interpreted here
 * (see {@link scanEscapeAt}): `\\` emits a single literal backslash, `\aX`
 * records an anchor, and the colour escapes set the colours of the
 * characters that follow. Colour digits are clamped to the dark half
 * (0-7); the `F`/`B` capitals add 8 to select the bright half. The initial
 * foreground is {@link Colour.WHITE} and the initial background is
 * {@link Colour.BLACK}.
 *
 * Tabs advance the column to the next multiple of {@link TAB_WIDTH} but
 * do not emit anything. Characters outside the CP437 range map through
 * {@link charCodeInCp437}. A space rendered on the all-black colour byte
 * (0) is left as zero, which the shader clips -- but a space on the
 * default white-on-black colours paints a normal (black-backgrounded)
 * quad; zero whitespace cells yourself when compositing over textures.
 *
 * @example
 * ```ts
 * import { textGlyphs } from "@micahdb/tscon";
 *
 * // bright-blue on black "Link", 4 cols wide
 * const g = textGlyphs("\\F4\\b0Link", 4, false);
 * ```
 *
 * @param text  The text to render, with escape sequences.
 * @param cols  Width of the grid in cells. If `<= 0`, an empty grid is
 *              returned.
 * @param wrap  How to lay out lines longer than `cols`: `true` word-wraps
 *              them, `false` truncates them, `"hard"` breaks them at
 *              exactly `cols` characters.
 * @returns     The rendered glyph grid, with anchors populated.
 */
export function textGlyphs(text: string, cols: number, wrap: Wrap): Glyphs {
	if (cols <= 0) {
		return emptyGlyphs();
	}

	const lines = textToLines(text, cols, wrap);

	if (lines.length === 0) {
		return emptyGlyphs();
	}

	const glyphs = {
		data: new Uint16Array(lines.length * cols),
		rows: lines.length,
		cols,
		anchors: {} as Record<number, Anchor[]>,
	};

	const colours: ColourState = { fg: Colour.WHITE, bg: Colour.BLACK };

	for (let row = 0; row < glyphs.rows; row++) {
		const line = lines[row]!;
		let col = 0;

		for (let i = 0; i < line.length; i++) {
			const scan = scanEscapeAt(line, i);

			if (scan.kind === "anchor") {
				recordAnchor(glyphs, scan.group, scan.options, row, col);
				i += scan.chars - 1;
				continue;
			}

			if (scan.kind === "colour") {
				applyColour(colours, scan);
				i += scan.chars - 1;
				continue;
			}

			// an escaped backslash displays one character
			if (scan.chars === 2) {
				i++;
			}

			const c = line[i]!;

			// tab
			if (c === "\t") {
				col += TAB_WIDTH - (col % TAB_WIDTH);

				continue;
			}

			if (col + 1 > cols) {
				// in theory, shouldn't happen; but be safe if it does
				break;
			}

			const char_code = charCodeInCp437(line.codePointAt(i) ?? 32);
			const colour_byte = ((colours.fg & 0b1111) << 4) | (colours.bg & 0b1111);

			// a space on the all-black colour byte is left as zero, which
			// the shader clips; anything else paints
			if (char_code !== 32 || colour_byte !== 0) {
				glyphs.data[row * cols + col] = (colour_byte << 8) | char_code;
			}

			col++;
		}
	}

	return glyphs;
}

/**
 * Maps the characters of one logical line of source text (escape
 * sequences included) to the visible positions they occupy after layout,
 * and back.
 *
 * Escape sequences taker cell, how to turn the source texture into a
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

// MIX/ROWS/COLS alternate cells between SAMPLE and GLYPHS by their
// pattern; the other modes apply to every cell as-is
function cellMode(mode: TexGlyphMode, row: number, col: number): TexGlyphMode {
	switch (mode) {
		case TexGlyphMode.MIX:
			return (row + col) % 2 === 0 ? TexGlyphMode.SAMPLE : TexGlyphMode.GLYPHS;

		case TexGlyphMode.ROWS:
			return row % 2 === 0 ? TexGlyphMode.SAMPLE : TexGlyphMode.GLYPHS;

		case TexGlyphMode.COLS:
			return col % 2 === 0 ? TexGlyphMode.SAMPLE : TexGlyphMode.GLYPHS;

		default:
			return mode;
	}
}

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
 * import { TexGlyphMode, textureGlyphs } from "@micahdb/tscon";
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

	for (let index = 0; index < rows * cols; index++) {
		const row = Math.floor(index / cols);
		const col = index % cols;
		const cell_mode = cellMode(mode, row, col);

		tglyphs.data[index] = ((row & 0xff) << 24) | ((cell_mode & 0xff) << 16) |
			(col & 0xffff);
	}

	return tglyphs;
}

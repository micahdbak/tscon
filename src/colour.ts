/**
 * Indices into the 16-entry terminal {@link PALETTE}.
 *
 * The palette is split into eight "dark" colours (0..7) and eight "bright"
 * colours (8..15). Glyph text encodes a foreground and background colour as
 * 4-bit values, the high bit of which selects the bright half of the palette.
 *
 * Use these members with the `Colour` escape sequences understood by
 * {@link textGlyphs} (`\fX`, `\FX`, `\bX`, `\BX`) and as the `fg`/`bg`
 * indices when building glyphs programmatically.
 *
 * @example
 * ```ts
 * import { Colour } from "@creat/tscon";
 *
 * // bright-blue foreground on black background
 * const text = "\\F4\\b0Link";
 * ```
 */
export enum Colour {
	// palette indices
	BLACK = 0,
	RED = 1,
	GREEN = 2,
	ORANGE = 3,
	BLUE = 4,
	MAGENTA = 5,
	CYAN = 6,
	GREY = 7,
	BRIGHT_BLACK = 8,
	BRIGHT_RED = 9,
	BRIGHT_GREEN = 10,
	YELLOW = 11,
	BRIGHT_BLUE = 12,
	BRIGHT_MAGENTA = 13,
	BRIGHT_CYAN = 14,
	WHITE = 15,
}

/**
 * The 16-colour terminal palette as flat 8-bit-per-channel RGB bytes.
 *
 * The array contains 48 entries: 16 colours of three bytes each, ordered to
 * match the {@link Colour} enum. Each triplet is an `[R, G, B]` value in the
 * range `0x00`-`0xff`.
 *
 * The first eight entries are the dark colours ({@link Colour.BLACK} ..
 * {@link Colour.GREY}) and the last eight are the bright colours
 * ({@link Colour.BRIGHT_BLACK} .. {@link Colour.WHITE}).
 *
 * @example
 * ```ts
 * import { Colour, PALETTE } from "@creat/tscon";
 *
 * const [r, g, b] = PALETTE.slice(Colour.BLUE * 3, Colour.BLUE * 3 + 3);
 * ```
 */
// deno-fmt-ignore
export const PALETTE = [
	// dark colours
	0x08, 0x08, 0x08, // Colour.BLACK
	0xed, 0x33, 0x3b, // Colour.RED
	0x57, 0xe3, 0x89, // Colour.GREEN
	0xff, 0x78, 0x00, // Colour.ORANGE
	0x62, 0xa0, 0xea, // Colour.BLUE
	0x91, 0x41, 0xac, // Colour.MAGENTA
	0x5b, 0xc8, 0xaf, // Colour.CYAN
	0xc0, 0xc0, 0xc0, // Colour.GREY

	// bright colours
	0x80, 0x80, 0x80, // Colour.BRIGHT_BLACK
	0xf6, 0x61, 0x51, // Colour.BRIGHT_RED
	0x8f, 0xf0, 0xa4, // Colour.BRIGHT_GREEN
	0xff, 0xa3, 0x48, // Colour.YELLOW
	0x99, 0xc1, 0xf1, // Colour.BRIGHT_BLUE
	0xdc, 0x8a, 0xdd, // Colour.BRIGHT_MAGENTA
	0x93, 0xdd, 0xc2, // Colour.BRIGHT_CYAN
	0xf4, 0xf4, 0xf4  // Colour.WHITE
];

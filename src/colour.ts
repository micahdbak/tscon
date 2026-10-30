/**
 * Indices into the 16-entry terminal {@link DEFAULT_COLOURS}.
 *
 * The palette is split into eight "dark" colours (0..7) and eight "bright"
 * colours (8..15). Glyph text encodes a foreground and background colour as
 * 4-bit values, the high bit of which selects the bright half of the palette.
 *
 * Use these members with the colour escapes understood by {@link Glyphs}
 * (`\fX`, `\FX`, `\bX`, `\BX`) and when choosing colours in code.
 *
 * @example
 * ```ts
 * import { Colour } from "@micahdb/tscon";
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
 * An 8-bit RGB colour, as `[red, green, blue]` bytes.
 *
 * Each channel is in the range `0x00`-`0xff`.
 *
 * @example
 * ```ts
 * const red: Rgb = [0xff, 0x00, 0x00];
 * ```
 */
export type Rgb = readonly [number, number, number];

/**
 * The default 16-colour terminal palette.
 *
 * The array has 16 {@link Rgb} colours, ordered to match the {@link Colour}
 * enum. The first eight are the dark colours ({@link Colour.BLACK} ..
 * {@link Colour.GREY}) and the last eight are the bright colours
 * ({@link Colour.BRIGHT_BLACK} .. {@link Colour.WHITE}).
 *
 * @example
 * ```ts
 * import { Colour, DEFAULT_COLOURS } from "@micahdb/tscon";
 *
 * const [r, g, b] = DEFAULT_COLOURS[Colour.BLUE];
 * ```
 */
export const DEFAULT_COLOURS: readonly Rgb[] = [
	// dark colours
	[0x08, 0x08, 0x08], // Colour.BLACK
	[0xed, 0x33, 0x3b], // Colour.RED
	[0x57, 0xe3, 0x89], // Colour.GREEN
	[0xff, 0x78, 0x00], // Colour.ORANGE
	[0x62, 0xa0, 0xea], // Colour.BLUE
	[0x91, 0x41, 0xac], // Colour.MAGENTA
	[0x5b, 0xc8, 0xaf], // Colour.CYAN
	[0xc0, 0xc0, 0xc0], // Colour.GREY

	// bright colours
	[0x80, 0x80, 0x80], // Colour.BRIGHT_BLACK
	[0xf6, 0x61, 0x51], // Colour.BRIGHT_RED
	[0x8f, 0xf0, 0xa4], // Colour.BRIGHT_GREEN
	[0xff, 0xa3, 0x48], // Colour.YELLOW
	[0x99, 0xc1, 0xf1], // Colour.BRIGHT_BLUE
	[0xdc, 0x8a, 0xdd], // Colour.BRIGHT_MAGENTA
	[0x93, 0xdd, 0xc2], // Colour.BRIGHT_CYAN
	[0xf4, 0xf4, 0xf4], // Colour.WHITE
];

/**
 * A terminal palette: up to 16 {@link Rgb} colours, indexed by {@link Colour}.
 *
 * The constructor copies the supplied colours. Missing entries fall back to
 * the built-in defaults when the palette is applied, and {@link toFloats}
 * clamps every channel to `0`-`255`.
 *
 * @example
 * ```ts
 * import { Colour, DEFAULT_COLOURS, Palette } from "@micahdb/tscon";
 *
 * const palette = new Palette(DEFAULT_COLOURS);
 * palette.colours[Colour.RED] = [0xff, 0x00, 0x00];
 * ```
 */
export class Palette {
	/** The mutable colour list, indexed by {@link Colour}. */
	readonly colours: Rgb[];

	/**
	 * Create a palette from up to 16 {@link Rgb} colours.
	 *
	 * @param colours  Colours to copy; omitted entries use the built-in defaults.
	 */
	constructor(colours: readonly Rgb[] = []) {
		this.colours = colours.map(([red, green, blue]): Rgb => [
			red,
			green,
			blue,
		]);
	}

	/**
	 * Convert the palette to normalised RGB floats for the shader.
	 *
	 * Missing entries use the built-in defaults; channels are clamped to `0`-`255`
	 * and rounded. The returned array has 48 entries: 16 colours of three
	 * channels each.
	 *
	 * @example
	 * ```ts
	 * const floats = new Palette(DEFAULT_COLOURS).toFloats();
	 * floats.length; // 48
	 * ```
	 *
	 * @returns  A new 48-entry `Float32Array`.
	 */
	toFloats(): Float32Array {
		const data = new Float32Array(16 * 3);

		for (let index = 0; index < 16; index++) {
			const [red = 0, green = 0, blue = 0] =
				this.colours[index] ?? DEFAULT_COLOURS[index]!;

			data[index * 3] = channel(red);
			data[index * 3 + 1] = channel(green);
			data[index * 3 + 2] = channel(blue);
		}

		return data;
	}
}

function channel(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.max(0, Math.min(255, Math.round(value))) / 0xff;
}

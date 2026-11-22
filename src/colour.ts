/**
 * Indices into the 18-entry terminal {@link DEFAULT_COLOURS}.
 *
 * The numeric escapes select eight dark colours (0..7) and eight bright
 * colours (8..15). Unstyled text uses the theme foreground and background
 * (16 and 17), which `\c` also restores.
 *
 * @example
 * ```ts
 * import { Colour, packCell } from "@micahdb/tscon";
 *
 * const cell = packCell(65, Colour.BRIGHT_BLUE, Colour.BG);
 * ```
 */
export enum Colour {
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
	FG = 16,
	BG = 17,
}

/**
 * RGB channels in red, green, blue order, each in the range 0-255.
 *
 * @example
 * ```ts
 * const red: Rgb = [0xff, 0x00, 0x00];
 * ```
 */
export type Rgb = readonly [number, number, number];

/**
 * The default terminal palette.
 *
 * The array is ordered by {@link Colour}.
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
	[0x25, 0x25, 0x30], // Colour.BLACK
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
	[0xcd, 0xcd, 0xcd], // Colour.FG
	[0x14, 0x14, 0x15], // Colour.BG
];

/**
 * A terminal palette: up to 18 {@link Rgb} colours, indexed by {@link Colour}.
 *
 * Use {@link Canvas.setPalette} to apply it to an existing canvas.
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
	 * Copy the supplied RGB triples into a palette.
	 *
	 * @example
	 * ```ts
	 * const palette = new Palette([[0xff, 0x00, 0x00]]);
	 * ```
	 *
	 * @param colours  Initial entries indexed by {@link Colour}.
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
	 * Missing entries use {@link DEFAULT_COLOURS}. Finite channels are
	 * clamped to 0-255 and rounded before scaling to 0-1. Non-finite
	 * channels are treated as zero.
	 *
	 * @example
	 * ```ts
	 * const floats = new Palette(DEFAULT_COLOURS).toFloats();
	 * floats.length; // 54
	 * ```
	 *
	 * @returns  A new 54-entry `Float32Array`.
	 */
	toFloats(): Float32Array {
		const data = new Float32Array(DEFAULT_COLOURS.length * 3);

		for (let index = 0; index < DEFAULT_COLOURS.length; index++) {
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

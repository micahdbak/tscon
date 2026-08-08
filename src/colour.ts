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

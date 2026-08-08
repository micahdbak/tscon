import { Colour } from "./colour.ts";
import { charCodeInCp437 } from "./cp437.ts";

export const TAB_WIDTH = 8;

function finalSpaceIdx(text: string, start: number): number {
	// skip remaining white space
	while (start < text.length && (text[start] === " " || text[start] === "\t")) {
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
			const cols_to_tab = TAB_WIDTH - (running_cols % TAB_WIDTH);

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

export type Anchor = {
	options: string | null;
	row: number;
	col: number;
};

export type Glyphs = {
	data: Uint16Array;
	rows: number;
	cols: number;
	anchors: Record<number, Anchor[]>;
};

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
			if (escape && i + 1 < line.length && line[i + 1] === "\\") {
				i++; // this will be displayed as a single character
				escape = false; // skip below checks
			}

			// anchor escape sequence
			// \aX                 : anchor in group X, no options
			// \aX{options string} : anchor in group X, with options
			if (
				escape && i + 2 < line.length && line[i + 1] === "a" &&
				!isNaN(Number(line[i + 2]))
			) {
				const num = Math.max(Math.min(Number(line[i + 2]), 9), 0); // 0..9
				let skip_chars = 2;

				if (glyphs.anchors[num] === undefined) {
					glyphs.anchors[num] = [];
				}

				const anchors = glyphs.anchors[num] as Anchor[];
				let options = null;

				// options string
				if (i + 4 <= line.length && line[i + 3] === "{") {
					const closing_brace = line.indexOf("}", i + 3);

					if (closing_brace > i + 3) {
						// \aX{options} <- take text from inner braces
						options = line.slice(i + 4, closing_brace);

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
				const num = Math.max(Math.min(Number(line[i + 2]), 7), 0); // 0..7

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
			const colour_byte = ((fg & 0b1111) << 4) | (bg & 0b1111);

			if (char_code !== " ".codePointAt(0) || colour_byte !== 0) {
				const data_idx = row * cols + col;

				const glyph = (colour_byte << 8) | (char_code & 0xff);

				glyphs.data[data_idx] = glyph;
			}

			col++;
		}
	}

	return glyphs;
}

export enum TexGlyphMode {
	SAMPLE = 0,
	GLYPHS = 1,
	BG_GLYPHS = 2,
	MIX = 3,
	ROWS = 4,
	COLS = 5,
}

export type TexGlyphs = {
	data: Uint32Array;
	rows: number;
	cols: number;
};

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
			mode = (row + col) % 2 == 0 ? TexGlyphMode.SAMPLE : TexGlyphMode.GLYPHS;
		} else if (global_mode == TexGlyphMode.ROWS) {
			mode = row % 2 == 0 ? TexGlyphMode.SAMPLE : TexGlyphMode.GLYPHS;
		} else if (global_mode == TexGlyphMode.COLS) {
			mode = col % 2 == 0 ? TexGlyphMode.SAMPLE : TexGlyphMode.GLYPHS;
		}

		const glyph = ((row & 0xff) << 24) | ((mode & 0xff) << 16) | (col & 0xffff);

		tglyphs.data[data_idx] = glyph;
	}

	return tglyphs;
}

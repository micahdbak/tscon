import { describe, expect, test } from "bun:test";

import { TextMap } from "./text_map.ts";
import { textToLines } from "./wrap.ts";

const B = "\\";

describe("TextMap", () => {
	test("maps plain text one-to-one", () => {
		const map = new TextMap("hello", textToLines("hello", 80, true));

		expect(map.positionAt(0)).toEqual({ row: 0, col: 0 });
		expect(map.positionAt(4)).toEqual({ row: 0, col: 4 });
		expect(map.indexAt(0, 3)).toBe(3);
		expect(map.visibleLength(0)).toBe(5);
	});

	test("escape characters map to the next visible character", () => {
		const source = `x${B}f1y${B}a0{opt}z`;
		const map = new TextMap(source, textToLines(source, 80, true));

		// the colour escape's characters map forward to "y"
		expect(map.positionAt(0)).toEqual({ row: 0, col: 0 });
		expect(map.positionAt(2)).toEqual({ row: 0, col: 1 });

		// the anchor's characters map forward to "z"
		expect(map.positionAt(5)).toEqual({ row: 0, col: 2 });
	});

	test("source past the last character lands at end of line", () => {
		const map = new TextMap("abc", textToLines("abc", 80, true));

		expect(map.positionAt(2)).toEqual({ row: 0, col: 2 });
		expect(map.positionAt(3)).toEqual({ row: 0, col: 3 });
	});

	test("doubled backslashes map one source character to one column", () => {
		const source = `a${B}${B}b`;
		const map = new TextMap(source, textToLines(source, 80, true));

		expect(map.positionAt(1)).toEqual({ row: 0, col: 1 });
		expect(map.positionAt(2)).toEqual({ row: 0, col: 2 });
		expect(map.indexAt(0, 1)).toBe(1);
	});

	test("wrapped rows map positions row by row", () => {
		const source = "aaaa bbbb";
		const map = new TextMap(source, textToLines(source, 5, true));

		// row 0 is "aaaa" (the breaking space is consumed), row 1 "bbbb"
		expect(map.positionAt(0)).toEqual({ row: 0, col: 0 });
		expect(map.positionAt(5)).toEqual({ row: 1, col: 0 });
		expect(map.indexAt(0, 0)).toBe(0);
		expect(map.indexAt(1, 0)).toBe(5);
	});

	test("clicks clamp the way a text cursor does", () => {
		const source = "aaaa bbbb";
		const map = new TextMap(source, textToLines(source, 5, true));

		// past the end of row 0 lands on its last character
		expect(map.indexAt(0, 9)).toBe(3);

		// off the ends of the map lands on the last visible character
		expect(map.indexAt(9, 9)).toBe(8);
	});

	test("a blank row continues to the next row's first character", () => {
		const source = `x${B}f1${B}a0{pic}`;
		const map = new TextMap(source, textToLines(source, 80, true));

		// row 0 has only "x"; the escapes that follow occupy no columns
		expect(map.visibleLength(0)).toBe(1);
		expect(map.indexAt(0, 0)).toBe(0);
	});
});


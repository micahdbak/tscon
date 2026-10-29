import { describe, expect, test } from "bun:test";

import { Glyphs } from "./glyphs.ts";
import { Wrap } from "./wrap.ts";

const B = "\\";

const hex = (glyphs: { data: Uint16Array }): string =>
	[...glyphs.data].map((cell) => cell.toString(16)).join(",");

describe("Glyphs compilation", () => {
	test("packs characters as fg/bg high byte plus CP437 char code", () => {
		// default white-on-black: colour byte f0
		expect(hex(new Glyphs("ab", 2))).toBe("f061,f062");
	});

	test("an empty grid comes back for zero columns", () => {
		const glyphs = new Glyphs("x", 0);

		expect(glyphs.rows).toBe(0);
		expect(glyphs.cols).toBe(0);
		expect(glyphs.data.length).toBe(0);
		expect(glyphs.wrappedText).toEqual([]);
	});

	test("anchors record their position and payload", () => {
		const glyphs = new Glyphs(`${B}a0{Foo|bar}Foo`, 10);

		expect(glyphs.anchors[0]).toEqual([{ options: "Foo|bar", row: 0, col: 0 }]);
		expect(hex(glyphs)).toBe("f046,f06f,f06f,0,0,0,0,0,0,0");
	});

	test("anchor payloads: absent and empty both read as null", () => {
		expect(new Glyphs(`${B}a0Foo`, 10).anchors[0]![0]!.options).toBeNull();
		expect(new Glyphs(`${B}a0{}Foo`, 10).anchors[0]![0]!.options).toBeNull();
	});

	test("an unterminated payload renders as raw text, backslash included", () => {
		const glyphs = new Glyphs(`x${B}a0{Foo`, 10);

		expect(glyphs.anchors[0]).toBeUndefined();
		expect(hex(glyphs)).toBe("f078,f05c,f061,f030,f07b,f046,f06f,f06f,0,0");
	});

	test("a payload must close on its own line", () => {
		const glyphs = new Glyphs(`${B}a0{li\nk}text`, 10);

		// the payload never closes on line 0, so nothing is an anchor
		expect(glyphs.anchors[0]).toBeUndefined();

		// line 0 renders raw; line 1 renders "k}text"
		expect(glyphs.wrappedText).toEqual([`${B}a0{li`, `k}text`]);
	});

	test("colours clamp to the palette; capitals select the bright half", () => {
		// \f1 dark, \F9 clamps to bright white, \b2 dark background
		expect(hex(new Glyphs(`${B}f1${B}F9${B}b2xB`, 2))).toBe("f278,f242");
		expect(hex(new Glyphs(`${B}f9a`, 1))).toBe("7061");
	});

	test("colour state carries across wrapped rows", () => {
		const glyphs = new Glyphs(`${B}f1aa bb`, 2, { wrap: Wrap.WORD });

		// both rows keep the dark-blue foreground
		expect(hex(glyphs)).toBe("1061,1061,1062,1062");
	});

	test("tabs advance to the next tab stop without emitting", () => {
		expect(hex(new Glyphs("\tab", 10))).toBe("0,0,0,0,0,0,0,0,f061,f062");
	});

	test("a space on the all-black colour byte is omitted; a default one paints", () => {
		// colour byte 0 (explicit black fg) leaves the cell zero, which the
		// shader clips; the default white-on-black space paints a quad
		expect(hex(new Glyphs(`${B}f0a `, 2))).toBe("61,0");
		expect(hex(new Glyphs("a ", 2))).toBe("f061,f020");
	});

	test("characters outside CP437 render as their fallback", () => {
		expect(hex(new Glyphs("é", 1))).toBe("f082");
	});

	test("anchors survive word wrap at the next row", () => {
		const glyphs = new Glyphs(`aaa ${B}a0x`, 3);

		expect(glyphs.anchors[0]).toEqual([{ options: null, row: 1, col: 0 }]);
	});

	test("an anchor captures the cell of the glyph that follows it", () => {
		// past a colour escape
		expect(new Glyphs(`${B}a0${B}f1x`, 10).anchors[0]).toEqual([
			{ options: null, row: 0, col: 0 },
		]);

		// past a tab
		expect(new Glyphs(`${B}a0\tx`, 10).anchors[0]).toEqual([
			{ options: null, row: 0, col: 8 },
		]);

		// past a wrap break
		expect(new Glyphs(`aa ${B}a0x`, 2).anchors[0]).toEqual([
			{ options: null, row: 1, col: 0 },
		]);

		// with nothing following: the end of the last row
		expect(new Glyphs(`ab${B}a0`, 10).anchors[0]).toEqual([
			{ options: null, row: 0, col: 2 },
		]);
	});

	test("raw renders every escape literally", () => {
		const source = `x${B}f1y${B}a0z`;
		const glyphs = new Glyphs(source, 10, { raw: true });

		expect(hex(glyphs)).toBe(
			"f078,f05c,f066,f031,f079,f05c,f061,f030,f07a,0",
		);
		expect(glyphs.anchors[0]).toBeUndefined();

		// every source character maps to its own cell
		for (const index of [0, 3, 6, 8]) {
			expect(glyphs.renderedCell(index)).toEqual({ row: 0, col: index });
		}
	});

	test("a backslash before a newline joins the lines", () => {
		const glyphs = new Glyphs(`ab${B}\ncd`, 10);

		expect(glyphs.wrappedText).toEqual(["abcd"]);
	});
});

describe("Glyphs positions", () => {
	test("plain text maps one-to-one", () => {
		const glyphs = new Glyphs("hello", 80);

		expect(glyphs.renderedCell(0)).toEqual({ row: 0, col: 0 });
		expect(glyphs.renderedCell(4)).toEqual({ row: 0, col: 4 });
		expect(glyphs.cursorIndex(0, 3)).toBe(3);
		expect(glyphs.rowCols(0)).toBe(5);
	});

	test("escape characters render nowhere but cursor forward", () => {
		const source = `x${B}f1y${B}a0{opt}z`;
		const glyphs = new Glyphs(source, 80);

		// the colour escape's characters render nowhere, display on "y"
		expect(glyphs.renderedCell(1)).toBeNull();
		expect(glyphs.renderedCell(2)).toBeNull();
		expect(glyphs.cursorCell(1)).toEqual({ row: 0, col: 1 });
		expect(glyphs.cursorCell(2)).toEqual({ row: 0, col: 1 });

		// the anchor's characters display on "z"
		expect(glyphs.cursorCell(5)).toEqual({ row: 0, col: 2 });
		expect(glyphs.cursorCell(5 + 6)).toEqual({ row: 0, col: 2 });

		// visible characters map exactly
		expect(glyphs.renderedCell(4)).toEqual({ row: 0, col: 1 });
		expect(glyphs.cursorIndex(0, 2)).toBe(13);
	});

	test("newlines and past-the-end render nowhere", () => {
		const glyphs = new Glyphs("ab\ncd", 80);

		expect(glyphs.renderedCell(2)).toBeNull();
		expect(glyphs.renderedCell(9)).toBeNull();

		// a cursor past the end displays at the end of the last row
		expect(glyphs.cursorCell(5)).toEqual({ row: 1, col: 2 });
		expect(glyphs.cursorCell(99)).toEqual({ row: 1, col: 2 });

		// a cursor before the start displays on the first character
		expect(glyphs.cursorCell(-3)).toEqual({ row: 0, col: 0 });
	});

	test("tabs render nowhere but cursor to their tab stop", () => {
		const glyphs = new Glyphs("a\tb", 80);

		expect(glyphs.renderedCell(1)).toBeNull();
		expect(glyphs.cursorCell(1)).toEqual({ row: 0, col: 8 });

		// clicks anywhere in the tab's span land on the tab; "a" and "b"
		// stay themselves
		expect(glyphs.cursorIndex(0, 0)).toBe(0);
		expect(glyphs.cursorIndex(0, 4)).toBe(1);
		expect(glyphs.cursorIndex(0, 7)).toBe(1);
		expect(glyphs.cursorIndex(0, 8)).toBe(2);
		expect(glyphs.rowCols(0)).toBe(9);
	});

	test("wrapped rows map positions row by row", () => {
		const source = "aaaa bbbb";
		const glyphs = new Glyphs(source, 5);

		// row 0 is "aaaa" (the breaking space is consumed), row 1 "bbbb"
		expect(glyphs.renderedCell(0)).toEqual({ row: 0, col: 0 });
		expect(glyphs.renderedCell(5)).toEqual({ row: 1, col: 0 });
		expect(glyphs.renderedCell(4)).toBeNull();
		expect(glyphs.cursorCell(4)).toEqual({ row: 1, col: 0 });
		expect(glyphs.cursorIndex(1, 0)).toBe(5);
	});

	test("clicks clamp the way a text cursor does", () => {
		const source = "aaaa bbbb";
		const glyphs = new Glyphs(source, 5);

		// past the end of row 0 lands on its last character
		expect(glyphs.cursorIndex(0, 9)).toBe(3);

		// left of the row lands on its first character
		expect(glyphs.cursorIndex(0, -3)).toBe(0);

		// off the ends of the grid lands on the last visible character
		expect(glyphs.cursorIndex(9, 9)).toBe(8);
	});

	test("a blank row continues to the next row's first character", () => {
		// row 1 holds only a colour escape: no visible characters
		const source = `ab\n${B}f1\ncd`;
		const glyphs = new Glyphs(source, 80);

		expect(glyphs.rowCols(1)).toBe(0);
		expect(glyphs.cursorIndex(1, 0)).toBe(7);
		expect(glyphs.cursorCell(4)).toEqual({ row: 2, col: 0 });
	});

	test("hard wrap keeps every character addressable", () => {
		const source = "hello world";
		const glyphs = new Glyphs(source, 5, { wrap: Wrap.HARD });

		expect(glyphs.wrappedText).toEqual(["hello", " worl", "d"]);

		// every source character except the implicit breaks maps exactly
		for (const [index, cell] of [
			[0, { row: 0, col: 0 }],
			[4, { row: 0, col: 4 }],
			[5, { row: 1, col: 0 }],
			[10, { row: 2, col: 0 }],
		] as [number, { row: number; col: number }][]) {
			expect(glyphs.renderedCell(index)).toEqual(cell);
		}

		expect(glyphs.rowCols(1)).toBe(5);
		expect(glyphs.rowCols(2)).toBe(1);
	});

	test("spansFor resolves a source range to per-row runs", () => {
		const glyphs = new Glyphs("aaaa bbbb", 5);

		// within one row
		expect(glyphs.spansFor(1, 3)).toEqual([{ row: 0, from: 1, to: 3 }]);

		// across the wrap break, merged over the eaten blank
		expect(glyphs.spansFor(2, 6)).toEqual([
			{ row: 0, from: 2, to: 4 },
			{ row: 1, from: 0, to: 1 },
		]);

		// escapes inside the range do not split the run
		const escaped = new Glyphs(`aa${B}f1bb`, 80);
		expect(escaped.spansFor(0, 6)).toEqual([{ row: 0, from: 0, to: 3 }]);

		// a range that renders nowhere produces no spans
		expect(new Glyphs("ab", 2).spansFor(5, 9)).toEqual([]);
		expect(new Glyphs(`x${B}f1y`, 2).spansFor(1, 3)).toEqual([]);
	});

	test("mapCells transforms cells and preserves everything else", () => {
		const glyphs = new Glyphs(`${B}a0{Foo|bar}foo bar`, 10);
		const original = glyphs.data.slice();

		const inverted = glyphs.mapCells((cell, row, col) => {
			if (row !== 0 || col >= 3) {
				return cell;
			}

			// swap the fg and bg nibbles
			const fg = (cell >> 12) & 0xf;
			const bg = (cell >> 8) & 0xf;

			return (bg << 12) | (fg << 8) | (cell & 0xff);
		});

		// data changed where mapped
		expect(inverted.data[0]).not.toBe(original[0]);

		// the original is untouched
		expect(glyphs.data).toEqual(original);

		// the copy keeps its mapping and anchors
		expect(inverted.sourceText).toBe(glyphs.sourceText);
		expect(inverted.wrappedText).toEqual(glyphs.wrappedText);
		expect(inverted.anchors).toEqual(glyphs.anchors);
		expect(inverted.renderedCell(8)).toEqual(glyphs.renderedCell(8));
		expect(inverted.cursorIndex(0, 5)).toBe(glyphs.cursorIndex(0, 5));

		// within limits the mapping to the mapped cells
		const limited = glyphs.mapCells(() => 0x0000, {
			row: 0,
			col: 0,
			rows: 1,
			cols: 3,
		});

		expect(limited.data[0]).toBe(0);
		expect(limited.data[3]).toBe(original[3]);
	});
});

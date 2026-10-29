import { describe, expect, test } from "bun:test";

import { textGlyphs } from "./glyphs.ts";

const B = "\\";

const hex = (glyphs: { data: Uint16Array }): string =>
	[...glyphs.data].map((cell) => cell.toString(16)).join(",");

describe("textGlyphs", () => {
	test("packs characters as fg/bg high byte plus CP437 char code", () => {
		// default white-on-black: colour byte f0
		expect(hex(textGlyphs("ab", 2, false))).toBe("f061,f062");
	});

	test("an empty grid comes back for zero columns", () => {
		const glyphs = textGlyphs("x", 0, false);

		expect(glyphs.rows).toBe(0);
		expect(glyphs.cols).toBe(0);
		expect(glyphs.data.length).toBe(0);
	});

	test("anchors record their position and payload", () => {
		const glyphs = textGlyphs(`${B}a0{Foo|bar}Foo`, 10, false);

		expect(glyphs.anchors[0]).toEqual([{ options: "Foo|bar", row: 0, col: 0 }]);
		expect(hex(glyphs)).toBe("f046,f06f,f06f,0,0,0,0,0,0,0");
	});

	test("anchor payloads: absent and empty both read as null", () => {
		expect(textGlyphs(`${B}a0Foo`, 10, false).anchors[0]![0]!.options).toBeNull();
		expect(textGlyphs(`${B}a0{}Foo`, 10, false).anchors[0]![0]!.options).toBeNull();
	});

	test("an unterminated payload renders literally after the escape", () => {
		const glyphs = textGlyphs(`x${B}a0{Foo`, 10, false);

		expect(glyphs.anchors[0]).toEqual([{ options: null, row: 0, col: 1 }]);
		expect(hex(glyphs)).toBe("f078,f07b,f046,f06f,f06f,0,0,0,0,0");
	});

	test("colours clamp to the palette; capitals select the bright half", () => {
		// \f1 dark, \F9 clamps to bright white, \b2 dark background
		expect(hex(textGlyphs(`${B}f1${B}F9${B}b2xB`, 2, false))).toBe("f278,f242");
		expect(hex(textGlyphs(`${B}f9a`, 1, false))).toBe("7061");
	});

	test("tabs advance to the next tab stop without emitting", () => {
		expect(hex(textGlyphs("\tab", 10, false))).toBe("0,0,0,0,0,0,0,0,f061,f062");
	});

	test("a space on the all-black colour byte is omitted; a default one paints", () => {
		// colour byte 0 (explicit black fg) leaves the cell zero, which the
		// shader clips; the default white-on-black space paints a quad
		expect(hex(textGlyphs(`${B}f0a `, 2, false))).toBe("61,0");
		expect(hex(textGlyphs("a ", 2, false))).toBe("f061,f020");
	});

	test("characters outside CP437 render as their fallback", () => {
		expect(hex(textGlyphs("é", 1, false))).toBe("f082");
	});

	test("anchors survive word wrap at the next row", () => {
		const glyphs = textGlyphs(`aaa ${B}a0x`, 3, true);

		expect(glyphs.anchors[0]).toEqual([{ options: null, row: 1, col: 0 }]);
	});
});

import { describe, expect, test } from "bun:test";

import { TexGlyphMode, textureGlyphs } from "./tex_glyphs.ts";

describe("textureGlyphs", () => {
	test("packs row, mode, and column into each cell", () => {
		const glyphs = textureGlyphs(2, 3, TexGlyphMode.GLYPHS);

		expect(glyphs.data[0]).toBe(1 << 16); // row 0, col 0, GLYPHS
		expect(glyphs.data[4]).toBe((1 << 24) | (1 << 16) | 1); // row 1, col 1
	});

	test("alternating modes switch cells between SAMPLE and GLYPHS", () => {
		const mix = textureGlyphs(1, 2, TexGlyphMode.MIX);
		const rows = textureGlyphs(2, 1, TexGlyphMode.ROWS);
		const cols = textureGlyphs(1, 2, TexGlyphMode.COLS);

		const mode_of = (cell: number): number => (cell >> 16) & 0xff;

		expect(mode_of(mix.data[0]!)).toBe(TexGlyphMode.SAMPLE);
		expect(mode_of(mix.data[1]!)).toBe(TexGlyphMode.GLYPHS);
		expect(mode_of(rows.data[0]!)).toBe(TexGlyphMode.SAMPLE);
		expect(mode_of(rows.data[1]!)).toBe(TexGlyphMode.GLYPHS);
		expect(mode_of(cols.data[0]!)).toBe(TexGlyphMode.SAMPLE);
		expect(mode_of(cols.data[1]!)).toBe(TexGlyphMode.GLYPHS);
	});
});

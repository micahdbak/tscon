import { describe, expect, test } from "bun:test";

import { Wrap, layoutText, textToLines } from "./wrap.ts";

const B = "\\";

describe("textToLines", () => {
	test("lays out plain text on one line", () => {
		expect(textToLines("hello world", 80)).toEqual(["hello world"]);
	});

	test("empty text lays out no lines", () => {
		expect(textToLines("", 80)).toEqual([]);
	});

	test("newlines break lines and blank lines survive", () => {
		expect(textToLines("a\n\nb", 80)).toEqual(["a", "", "b"]);
		expect(textToLines("a\n", 80)).toEqual(["a"]);
	});

	test("broken lines trim trailing whitespace; the last line keeps it", () => {
		expect(textToLines("a  \nb  ", 80)).toEqual(["a", "b  "]);
	});

	test("a backslash before a newline joins the lines", () => {
		expect(textToLines(`ab${B}\ncd`, 80)).toEqual(["abcd"]);
	});

	test("an escaped backslash before a newline does not continue", () => {
		// the pair stays verbatim in the piece and renders one backslash
		expect(textToLines(`ab${B}${B}\ncd`, 80)).toEqual([`ab${B}${B}`, "cd"]);
	});

	test("word wrap breaks at the last space", () => {
		expect(textToLines("ab cd ef", 5)).toEqual(["ab cd", "ef"]);
	});

	test("a word longer than a line breaks mid-word", () => {
		expect(textToLines("abcdefgh", 3)).toEqual(["abc", "def", "gh"]);
	});

	test("a tab over the line width breaks the line", () => {
		expect(textToLines("aaaaa\tb", 5)).toEqual(["aaaaa", "b"]);
		expect(textToLines("\tab", 10)).toEqual(["\tab"]);
	});

	test("truncation discards the rest of the line", () => {
		expect(textToLines("abc def", 3, { wrap: Wrap.TRUNCATE })).toEqual(["abc"]);

		// later logical lines still lay out
		expect(textToLines("ab cd ef\ngh", 3, { wrap: Wrap.TRUNCATE })).toEqual(["ab", "gh"]);
	});

	test("escape sequences take no columns", () => {
		const line = `x${B}a0y ${B}a1{opt}z ${B}f1q`;

		// "x" + "y " + "z " + "q" = 8 visible columns
		expect(textToLines(line, 8)).toEqual([line]);
		expect(textToLines(`${line}pad`, 8).length).toBe(2);
	});

	test("raw counts every character as a column", () => {
		const line = `x${B}f1y${B}a0z`;

		// the same text is 9 raw characters
		expect(textToLines(line, 80)).toEqual([line]);
		expect(textToLines(line, 80, { raw: true })).toEqual([line]);
		expect(textToLines(`${line}pad`, 9, { raw: true }).length).toBe(2);
	});

	test("zero columns lays out no lines", () => {
		expect(textToLines("x", 0)).toEqual([]);
	});
});

describe("hard wrap", () => {
	test("breaks at exactly the column budget", () => {
		expect(textToLines("abcdefgh", 3, { wrap: Wrap.HARD })).toEqual(["abc", "def", "gh"]);
		expect(textToLines("abcdefghij", 3, { wrap: Wrap.HARD })).toEqual([
			"abc",
			"def",
			"ghi",
			"j",
		]);
	});

	test("escapes take no columns and stay attached", () => {
		const line = `x${B}f1y${B}a0z`;

		expect(textToLines(line, 2, { wrap: Wrap.HARD })).toEqual([`x${B}f1y`, `${B}a0z`]);
	});

	test("newlines still break lines", () => {
		expect(textToLines("abcd\nef", 3, { wrap: Wrap.HARD })).toEqual(["abc", "d", "ef"]);
		expect(textToLines("ab\ncd", 5, { wrap: Wrap.HARD })).toEqual(["ab", "cd"]);
	});

	test("raw breaks at the budget with escapes visible", () => {
		const line = `x${B}f1y`;

		expect(textToLines(line, 3, { wrap: Wrap.HARD, raw: true })).toEqual([`x${B}f`, `1y`]);
	});

	test("an empty text lays out one empty line", () => {
		expect(textToLines("", 3, { wrap: Wrap.HARD })).toEqual([""]);
	});
});

describe("layoutText", () => {
	test("pieces are verbatim source slices, tracked by offset", () => {
		const layout = layoutText("aaaa bbbb", 5);

		expect(layout.starts).toEqual([0, 5]);

		// every piece character is the source character at starts + i
		for (const [row, piece] of layout.pieces.entries()) {
			for (let i = 0; i < piece.length; i++) {
				expect(piece[i]).toBe("aaaa bbbb"[layout.starts[row]! + i]);
			}
		}
	});

	test("hard wrap offsets cover escapes and pending moves", () => {
		const layout = layoutText(`x${B}f1y${B}a0z`, 2, { wrap: Wrap.HARD });

		expect(layout.pieces).toEqual([`x${B}f1y`, `${B}a0z`]);
		expect(layout.starts).toEqual([0, 5]);
	});

	test("truncation leaves the discarded text unmapped", () => {
		const layout = layoutText("ab cd ef\ngh", 3, { wrap: Wrap.TRUNCATE });

		expect(layout.pieces).toEqual(["ab", "gh"]);
		expect(layout.starts).toEqual([0, 9]);
	});
});

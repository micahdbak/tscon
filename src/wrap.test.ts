import { describe, expect, test } from "bun:test";

import { textToLines } from "./wrap.ts";

const B = "\\";

describe("textToLines", () => {
	test("lays out plain text on one line", () => {
		expect(textToLines("hello world", 80, true)).toEqual(["hello world"]);
	});

	test("empty text lays out no lines", () => {
		expect(textToLines("", 80, true)).toEqual([]);
	});

	test("newlines break lines and blank lines survive", () => {
		expect(textToLines("a\n\nb", 80, true)).toEqual(["a", "", "b"]);
		expect(textToLines("a\n", 80, true)).toEqual(["a"]);
	});

	test("broken lines trim trailing whitespace; the last line keeps it", () => {
		expect(textToLines("a  \nb  ", 80, true)).toEqual(["a", "b  "]);
	});

	test("a backslash before a newline joins the lines", () => {
		expect(textToLines("ab\\\ncd", 80, true)).toEqual(["abcd"]);
	});

	test("word wrap breaks at the last space", () => {
		expect(textToLines("ab cd ef", 5, true)).toEqual(["ab cd", "ef"]);
	});

	test("a word longer than a line breaks mid-word", () => {
		expect(textToLines("abcdefgh", 3, true)).toEqual(["abc", "def", "gh"]);
	});

	test("a tab over the line width breaks the line", () => {
		expect(textToLines("aaaaa\tb", 5, true)).toEqual(["aaaaa", "b"]);
		expect(textToLines("\tab", 10, true)).toEqual(["\tab"]);
	});

	test("truncation discards the rest of the line", () => {
		expect(textToLines("abc def", 3, false)).toEqual(["abc"]);

		// later logical lines still lay out
		expect(textToLines("ab cd ef\ngh", 3, false)).toEqual(["ab", "gh"]);
	});

	test("escape sequences take no columns", () => {
		const line = `x${B}a0y ${B}a1{opt}z ${B}f1q`;

		// "x" + "y " + "z " + "q" = 8 visible columns
		expect(textToLines(line, 8, true)).toEqual([line]);
		expect(textToLines(`${line}pad`, 8, true).length).toBe(2);
	});

	test("zero columns lays out no lines", () => {
		expect(textToLines("x", 0, true)).toEqual([]);
	});
});

describe("hard wrap", () => {
	test("breaks at exactly the column budget", () => {
		expect(textToLines("abcdefgh", 3, "hard")).toEqual(["abc", "def", "gh"]);
		expect(textToLines("abcdefghij", 3, "hard")).toEqual(["abc", "def", "ghi", "j"]);
	});

	test("escapes take no columns and stay attached", () => {
		const line = `x${B}f1y${B}a0z`;

		expect(textToLines(line, 2, "hard")).toEqual([`x${B}f1y`, `${B}a0z`]);
	});

	test("newlines still break lines", () => {
		expect(textToLines("abcd\nef", 3, "hard")).toEqual(["abc", "d", "ef"]);
		expect(textToLines("ab\ncd", 5, "hard")).toEqual(["ab", "cd"]);
	});

	test("an empty text lays out one empty line", () => {
		expect(textToLines("", 3, "hard")).toEqual([""]);
	});
});

import { describe, expect, test } from "bun:test";

import { hasEscape, scanEscapeAt } from "./escape.ts";

const B = "\\";

describe("scanEscapeAt", () => {
	test("plain characters are text", () => {
		expect(scanEscapeAt("abc", 0)).toEqual({ kind: "text", chars: 1 });
	});

	test("an escaped backslash collapses to one character", () => {
		expect(scanEscapeAt(`${B}${B}x`, 0)).toEqual({ kind: "text", chars: 2 });
	});

	test("a lone backslash displays itself", () => {
		expect(scanEscapeAt(`${B}n`, 0)).toEqual({ kind: "text", chars: 1 });
		expect(scanEscapeAt(`${B}`, 0)).toEqual({ kind: "text", chars: 1 });
	});

	test("anchors scan with their group and payload", () => {
		expect(scanEscapeAt(`${B}a0`, 0)).toEqual({ kind: "anchor", chars: 3, group: 0, options: null });
		expect(scanEscapeAt(`${B}a9{a|b}x`, 0)).toEqual({ kind: "anchor", chars: 8, group: 9, options: "a|b" });
		expect(scanEscapeAt(`${B}a0{}x`, 0).options).toBeNull();
		expect(scanEscapeAt(`${B}a0{x`, 0)).toEqual({ kind: "anchor", chars: 3, group: 0, options: null });
	});

	test("colours scan with attribute, brightness, and digit", () => {
		expect(scanEscapeAt(`${B}f0`, 0)).toEqual({ kind: "colour", chars: 3, attribute: "fg", bright: false, num: 0 });
		expect(scanEscapeAt(`${B}F9`, 0)).toEqual({ kind: "colour", chars: 3, attribute: "fg", bright: true, num: 9 });
		expect(scanEscapeAt(`${B}b7`, 0)).toEqual({ kind: "colour", chars: 3, attribute: "bg", bright: false, num: 7 });
		expect(scanEscapeAt(`${B}B3`, 0)).toEqual({ kind: "colour", chars: 3, attribute: "bg", bright: true, num: 3 });
	});

	test("the indices are a single digit: anything else is text", () => {
		// Number(" ") is 0, but a space is not a digit
		expect(scanEscapeAt(`${B}a y`, 0)).toEqual({ kind: "text", chars: 1 });
		expect(scanEscapeAt(`${B}f y`, 0)).toEqual({ kind: "text", chars: 1 });
		expect(scanEscapeAt(`${B}a`, 0)).toEqual({ kind: "text", chars: 1 });
	});
});

describe("hasEscape", () => {
	test("finds anchors, colours, and escaped backslashes", () => {
		expect(hasEscape(`x${B}a0y`)).toBe(true);
		expect(hasEscape(`x${B}f1y`)).toBe(true);
		expect(hasEscape(`x${B}${B}y`)).toBe(true);
	});

	test("plain text and lone backslashes have none", () => {
		expect(hasEscape("plain")).toBe(false);
		expect(hasEscape(`back${B}slash`)).toBe(false);
		expect(hasEscape("")).toBe(false);
	});
});

import { describe, expect, test } from "bun:test";

import { pointerCell, scrollRowsForKey, wheelRows } from "./input.ts";

describe("pointerCell", () => {
	test("maps a point inside the element to a cell", () => {
		expect(pointerCell(0, 0, 80, 160, 10, 10)).toEqual({ row: 0, col: 0 });
		expect(pointerCell(79, 159, 80, 160, 10, 10)).toEqual({ row: 9, col: 9 });
		expect(pointerCell(40, 80, 80, 160, 10, 10)).toEqual({ row: 5, col: 5 });
	});

	test("returns null outside the element", () => {
		expect(pointerCell(-1, 0, 80, 160, 10, 10)).toBeNull();
		expect(pointerCell(0, -1, 80, 160, 10, 10)).toBeNull();
		expect(pointerCell(80, 0, 80, 160, 10, 10)).toBeNull();
		expect(pointerCell(0, 160, 80, 160, 10, 10)).toBeNull();
	});

	test("returns null for a zero-sized element", () => {
		expect(pointerCell(0, 0, 0, 160, 10, 10)).toBeNull();
		expect(pointerCell(0, 0, 80, 0, 10, 10)).toBeNull();
	});
});

describe("wheelRows", () => {
	test("pixel deltas come back fractionally", () => {
		expect(wheelRows(0, 16, 16, 30)).toBe(1);
		expect(wheelRows(0, 8, 16, 30)).toBe(0.5);
		expect(wheelRows(0, -32, 16, 30)).toBe(-2);
	});

	test("row and page deltas come back whole", () => {
		expect(wheelRows(1, 3, 16, 30)).toBe(3);
		expect(wheelRows(2, 1, 16, 30)).toBe(30);
		expect(wheelRows(2, -1, 16, 30)).toBe(-30);
	});

	test("a zero cell height produces no pixel movement", () => {
		expect(wheelRows(0, 16, 0, 30)).toBe(0);
	});
});

describe("scrollRowsForKey", () => {
	test("maps scroll keys", () => {
		expect(scrollRowsForKey("j")).toBe(1);
		expect(scrollRowsForKey("ArrowDown")).toBe(1);
		expect(scrollRowsForKey("k")).toBe(-1);
		expect(scrollRowsForKey("ArrowUp")).toBe(-1);
		expect(scrollRowsForKey("0")).toBe(-999999);
	});

	test("non-scroll keys return zero", () => {
		expect(scrollRowsForKey("x")).toBe(0);
		expect(scrollRowsForKey("Enter")).toBe(0);
	});
});

import { describe, expect, test } from "bun:test";

import { Canvas } from "./canvas.ts";
import { TestCanvasHost } from "./canvas_host.ts";
import type { Key } from "./input.ts";
import { createHeadlessGL2 } from "./headless_gl.ts";

function harness(css_width = 800, css_height = 480) {
	const host = new TestCanvasHost({ css_width, css_height });
	const canvas = new Canvas(host, createHeadlessGL2());
	const wheel: number[] = [];
	const keys: string[] = [];
	const resized: number[] = [];

	canvas.addEventListener("wheel", (event) => {
		wheel.push((event as CustomEvent<{ rows: number }>).detail.rows);
	});
	canvas.addEventListener("keydown", (event) => {
		keys.push((event as CustomEvent<{ key: string }>).detail.key);
	});
	canvas.addEventListener("resize", () => {
		resized.push(1);
	});

	return { host, canvas, wheel, keys, resized };
}

// the CSS point at the centre of a cell
function cellPoint(
	host: TestCanvasHost,
	canvas: Canvas,
	row: number,
	col: number,
) {
	return {
		x: ((col + 0.5) / canvas.cols) * host.css_width,
		y: ((row + 0.5) / canvas.rows) * host.css_height,
	};
}

describe("Canvas", () => {
	test("derives the grid from host size and DPR", () => {
		const host = new TestCanvasHost({ css_width: 800, css_height: 480 });
		const canvas = new Canvas(host, createHeadlessGL2());

		expect(canvas.width).toBe(800);
		expect(canvas.height).toBe(480);
		expect(canvas.rows).toBe(30);
		expect(canvas.cols).toBe(100);
		expect(canvas.actual_cell_width).toBe(8);
		expect(canvas.actual_cell_height).toBe(16);
	});

	test("recomputes the grid and dispatches resize", () => {
		const { host, canvas, resized } = harness();

		host.resize(400, 240);

		expect(canvas.rows).toBe(15);
		expect(canvas.cols).toBe(50);
		expect(canvas.width).toBe(400);
		expect(canvas.height).toBe(240);
		expect(resized).toHaveLength(1);
	});

	test("maps pointer positions to cells", () => {
		const { host, canvas } = harness();
		const point = cellPoint(host, canvas, 3, 4);

		host.pointerMove(point.x, point.y);

		expect(canvas.mouse_row).toBe(3);
		expect(canvas.mouse_col).toBe(4);
		expect(canvas.mouseAt(3, 4, 1, 1)).toBe(true);

		host.pointerMove(-1, 0);

		expect(canvas.mouse_row).toBeUndefined();
		expect(canvas.mouse_col).toBeUndefined();
	});

	test("tracks press origin and click state", () => {
		const { host, canvas } = harness();
		const point = cellPoint(host, canvas, 3, 4);

		host.pointerMove(point.x, point.y);
		host.pointerDown(point.x, point.y);

		expect(canvas.mouse_down).toBe(true);
		expect(canvas.mouse_down_row).toBe(3);
		expect(canvas.mouse_down_col).toBe(4);
		expect(canvas.mouseDownAt(3, 4, 1, 1)).toBe(true);

		host.pointerUp(point.x, point.y);

		expect(canvas.mouse_down).toBe(false);
		expect(canvas.mouse_click).toBe(true);
	});

	test("accumulates pixel wheel deltas into whole rows", () => {
		const { host, wheel } = harness();

		host.wheel(8);
		expect(wheel).toEqual([]);

		host.wheel(8);
		expect(wheel).toEqual([1]);

		host.wheel(8);
		host.wheel(8);
		expect(wheel).toEqual([1, 1]);
	});

	test("converts line and page wheel deltas", () => {
		const { host, wheel } = harness();

		host.wheel(2, 1);
		host.wheel(1, 2);
		host.wheel(-1, 2);

		expect(wheel).toEqual([2, 30, -30]);
	});

	test("scroll keys emit wheel rows when focused", () => {
		const { host, wheel, keys } = harness();

		host.focus();
		host.keyDown("j");

		expect(wheel).toEqual([1]);
		expect(keys).toEqual(["j"]);
		expect(host.default_prevented).toBe(true);

		host.keyUp("j");
	});

	test("a keydown listener can suppress built-in scrolling", () => {
		const { host, canvas, wheel } = harness();

		canvas.addEventListener("keydown", (event) => {
			(event as CustomEvent<Key>).detail.prevent_default();
		});

		host.focus();
		host.keyDown("j");

		expect(wheel).toEqual([]);
		expect(host.default_prevented).toBe(true);
	});

	test("scroll keys work while the pointer is over the canvas", () => {
		const { host, canvas, wheel } = harness();
		const point = cellPoint(host, canvas, 3, 4);

		host.pointerMove(point.x, point.y);
		host.keyDown("k");

		expect(wheel).toEqual([-1]);
	});

	test("scroll keys do not scroll when the canvas is inactive", () => {
		const { host, wheel, keys } = harness();

		host.keyDown("j");

		expect(wheel).toEqual([]);
		expect(keys).toEqual(["j"]);
		expect(host.default_prevented).toBe(false);
	});

	test("clear resets the cursor class", () => {
		const { canvas } = harness();

		canvas.class_name = "pointer";
		canvas.clear();

		expect(canvas.class_name).toBe("");
	});

	test("dispose stops host events", () => {
		const { host, canvas } = harness();
		const point = cellPoint(host, canvas, 3, 4);

		canvas.dispose();
		host.pointerMove(point.x, point.y);

		expect(canvas.mouse_row).toBeUndefined();
	});
});

import { afterAll, describe, expect, test } from "bun:test";

import { CP437_CHARS, charCodeInCp437, renderCp437 } from "./cp437.ts";

const previous_document = (globalThis as Record<string, unknown>).document;

afterAll(() => {
	(globalThis as Record<string, unknown>).document = previous_document;
});

type GlyphMetrics = {
	width: number;
	left: number;
	right: number;
	ascent: number;
	descent: number;
};

function mockDocument() {
	(globalThis as Record<string, unknown>).document = {
		fonts: {
			load: async () => {},
		},
	};
}

// a 2D context that reports `metrics` per character and records where each
// glyph lands, transform included, so cell geometry and fitting can be asserted
function mockContext(metrics: (text: string) => GlyphMetrics) {
	const drawn: { text: string; x: number; y: number; scale: number }[] = [];
	const state = { x: 0, y: 0, scale: 1 };
	const stack: (typeof state)[] = [];

	const context = {
		font: "",
		fillStyle: "",
		measureText: (text: string) => {
			const { width, left, right, ascent, descent } = metrics(text);

			return {
				width,
				actualBoundingBoxLeft: left,
				actualBoundingBoxRight: right,
				actualBoundingBoxAscent: ascent,
				actualBoundingBoxDescent: descent,
			};
		},
		fillRect: () => {},
		save: () => {
			stack.push({ ...state });
		},
		restore: () => {
			const previous = stack.pop();

			if (previous !== undefined) {
				state.x = previous.x;
				state.y = previous.y;
				state.scale = previous.scale;
			}
		},
		beginPath: () => {},
		rect: () => {},
		clip: () => {},
		translate: (x: number, y: number) => {
			state.x += x;
			state.y += y;
		},
		scale: (factor: number) => {
			state.scale *= factor;
		},
		fillText: (text: string, x: number, y: number) => {
			drawn.push({
				text,
				x: state.x + state.scale * x,
				y: state.y + state.scale * y,
				scale: state.scale,
			});
		},
	};

	return { context, drawn };
}

function mockCanvas(context: unknown) {
	return {
		width: 0,
		height: 0,
		getContext: () => context,
	} as unknown as HTMLCanvasElement & { width: number; height: number };
}

describe("cp437", () => {
	test("maps supported code points to their CP437 index", () => {
		expect(CP437_CHARS).toHaveLength(256);
		expect(charCodeInCp437(0x41)).toBe(65);
		expect(charCodeInCp437(0x263a)).toBe(1);
		expect(charCodeInCp437(0x2591)).toBe(176);
		expect(charCodeInCp437(0x1f600)).toBe(0);
	});

	test("renders a 32x8 glyph atlas", async () => {
		mockDocument();

		const metrics = { width: 8, left: 0, right: 8, ascent: 6, descent: 2 };
		const { context, drawn } = mockContext(() => metrics);
		const canvas = mockCanvas(context);

		await renderCp437(canvas, "16px test");

		// 8px advance plus a pixel either side, and 16px of cell plus the same
		expect(canvas.width).toBe(320);
		expect(canvas.height).toBe(144);
		expect(drawn).toHaveLength(254);
		expect(drawn[0]!.text).toBe("☺");
	});

	test("grows the cell so ink outside the font's metrics is not cut off", async () => {
		mockDocument();

		// a fallback font painting higher and lower than the advance-sized cell
		const metrics = { width: 8, left: 0, right: 8, ascent: 20, descent: 4 };
		const { context, drawn } = mockContext(() => metrics);
		const canvas = mockCanvas(context);

		await renderCp437(canvas, "16px test");

		// 24px of ink plus the padding either side, instead of the 16px floor
		expect(canvas.height).toBe(208);

		// each row carries the same baseline, with the ink box inside the padding
		const baseline = 1 + 20;

		for (const [i, glyph] of drawn.entries()) {
			const row = Math.floor((i + 1) / 32);

			expect(glyph.y).toBe(row * 26 + baseline);
		}

		expect(drawn[0]!.y - 20).toBe(1);
	});

	test("moves an offset glyph into its cell instead of cropping it", async () => {
		mockDocument();

		// the ink sits entirely to the right of the pen, past the cell's edge
		const offset = { width: 8, left: -2, right: 10, ascent: 6, descent: 2 };
		const narrow = { width: 8, left: 0, right: 8, ascent: 6, descent: 2 };
		const { context, drawn } = mockContext((text) => (text === "☺" ? offset : narrow));
		const canvas = mockCanvas(context);

		await renderCp437(canvas, "16px test");

		// cell 1 starts at 10px and the pen at 11px; 2px of ink hung past the
		// cell, so the pen moves back by the same 2px
		expect(drawn[0]!.x).toBe(9);
		expect(drawn[0]!.scale).toBe(1);

		// the next cell is untouched, holding its glyph at the plain pen position
		expect(drawn[1]!.x).toBe(21);
	});

	test("shrinks a glyph wider than its cell instead of cropping it", async () => {
		mockDocument();

		// the smiley arrives from a fallback font at twice the advance width
		const wide = { width: 8, left: 0, right: 16, ascent: 6, descent: 2 };
		const narrow = { width: 8, left: 0, right: 8, ascent: 6, descent: 2 };
		const { context, drawn } = mockContext((text) => (text === "☺" ? wide : narrow));
		const canvas = mockCanvas(context);

		await renderCp437(canvas, "16px test");

		// half size, so 16px of ink lands inside the 8px cell
		expect(drawn[0]!.scale).toBe(0.5);
		expect(drawn[1]!.scale).toBe(1);

		// the cell is left at its advance width: only the glyph is scaled
		expect(canvas.width).toBe(320);
	});
});

import { afterAll, describe, expect, test } from "bun:test";

import { CP437_CHARS, charCodeInCp437, renderCp437 } from "./cp437.ts";

const previous_document = (globalThis as Record<string, unknown>).document;

afterAll(() => {
	(globalThis as Record<string, unknown>).document = previous_document;
});

describe("cp437", () => {
	test("maps supported code points to their CP437 index", () => {
		expect(CP437_CHARS).toHaveLength(256);
		expect(charCodeInCp437(0x41)).toBe(65);
		expect(charCodeInCp437(0x263a)).toBe(1);
		expect(charCodeInCp437(0x2591)).toBe(176);
		expect(charCodeInCp437(0x1f600)).toBe(0);
	});

	test("renders a 32x8 glyph atlas", async () => {
		let fills = 0;
		let saves = 0;

		const context = {
			font: "",
			fillStyle: "",
			measureText: () => ({
				width: 8,
				fontBoundingBoxAscent: 10,
			}),
			fillRect: () => {},
			save: () => {
				saves++;
			},
			beginPath: () => {},
			rect: () => {},
			clip: () => {},
			fillText: () => {
				fills++;
			},
			restore: () => {},
		};

		const canvas = {
			width: 0,
			height: 0,
			getContext: () => context,
		};

		(globalThis as Record<string, unknown>).document = {
			fonts: {
				load: async () => {},
			},
		};

		await renderCp437(canvas as unknown as HTMLCanvasElement, "16px test");

		expect(canvas.width).toBe(320);
		expect(canvas.height).toBe(144);
		expect(fills).toBe(254);
		expect(saves).toBe(254);
	});
});

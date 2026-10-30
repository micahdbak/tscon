import { describe, expect, test } from "bun:test";

import { HeadlessGL2 } from "./headless_gl.ts";
import { loadModernDosTexture } from "./moderndos.ts";

class FontGL extends HeadlessGL2 {
	readonly tex_images: unknown[][] = [];

	override texImage2D(...args: unknown[]): void {
		this.tex_images.push(args);
		super.texImage2D(...args);
	}
}

describe("modern DOS font", () => {
	test("uploads the 32x32 font atlas", () => {
		const gl = new FontGL();
		const texture = loadModernDosTexture(gl as unknown as WebGL2RenderingContext);

		expect(texture).toBeTruthy();
		expect(gl.tex_images).toHaveLength(1);

		const image = gl.tex_images[0]!;
		const pixels = image[8] as Uint8Array;

		expect(image[3]).toBe(32);
		expect(image[4]).toBe(32);
		expect(pixels).toBeInstanceOf(Uint8Array);
		expect(pixels).toHaveLength(32 * 32 * 4);
	});
});

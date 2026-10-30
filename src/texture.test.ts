import { afterAll, describe, expect, test } from "bun:test";

import { HeadlessGL2 } from "./headless_gl.ts";
import { loadCubeMap, loadTexture } from "./texture.ts";

class TextureGL extends HeadlessGL2 {
	readonly images: unknown[][] = [];

	override texImage2D(...args: unknown[]): void {
		this.images.push(args);
		super.texImage2D(...args);
	}
}

class FakeImage {
	onload: (() => void) | null = null;
	onerror: ((error: Event | string) => void) | null = null;

	set src(_value: string) {
		queueMicrotask(() => this.onload?.());
	}
}

const previous_image = (globalThis as Record<string, unknown>).Image;

afterAll(() => {
	(globalThis as Record<string, unknown>).Image = previous_image;
});

describe("texture loading", () => {
	test("loadTexture uploads one image texture", async () => {
		(globalThis as Record<string, unknown>).Image = FakeImage;

		const gl = new TextureGL();
		const texture = await loadTexture(gl as unknown as WebGL2RenderingContext, "image.png");

		expect(texture).toBeTruthy();
		expect(gl.images).toHaveLength(1);
	});

	test("loadCubeMap uploads six faces", async () => {
		(globalThis as Record<string, unknown>).Image = FakeImage;

		const gl = new TextureGL();
		const texture = await loadCubeMap(gl as unknown as WebGL2RenderingContext, [
			"right.png",
			"left.png",
			"top.png",
			"bottom.png",
			"front.png",
			"back.png",
		]);

		expect(texture).toBeTruthy();
		expect(gl.images).toHaveLength(6);
	});

	test("loadCubeMap rejects the wrong number of faces", async () => {
		const gl = new TextureGL();

		await expect(
			loadCubeMap(gl as unknown as WebGL2RenderingContext, []),
		).rejects.toThrow("Cube map requires exactly 6 faces");
	});
});

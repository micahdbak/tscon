import { describe, expect, test } from "bun:test";
import { HeadlessGL2 } from "./headless_gl.ts";

describe("HeadlessGL2", () => {
	test("the class is a WebGL2-shaped no-op context", () => {
		const context = new HeadlessGL2();

		expect(context.isContextLost()).toBe(false);
		expect(context.checkFramebufferStatus(context.FRAMEBUFFER)).toBe(
			context.FRAMEBUFFER_COMPLETE,
		);
		expect(context.getSupportedExtensions()).toEqual([]);
		expect(context.getExtension("test")).toBeNull();
	});
});

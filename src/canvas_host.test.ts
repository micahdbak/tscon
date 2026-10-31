import { afterAll, describe, expect, test } from "bun:test";

import { Canvas } from "./canvas.ts";
import { TestCanvasHost, WebCanvasHost, type CanvasHostEventMap } from "./canvas_host.ts";
import { Palette } from "./colour.ts";
import { createHeadlessGL2 } from "./headless_gl.ts";

type FakeWindow = EventTarget & { devicePixelRatio: number };

function fakeWindow(): FakeWindow {
	return Object.assign(new EventTarget(), { devicePixelRatio: 1 });
}

function fakeElement() {
	let width = 800;
	let height = 480;
	let captures = 0;

	const element = Object.assign(new EventTarget(), {
		clientWidth: width,
		clientHeight: height,
		width: 0,
		height: 0,
		tabIndex: 0,
		hasAttribute: () => false,
		setPointerCapture: () => {
			captures++;
		},
		getBoundingClientRect: () => ({
			left: 0,
			top: 0,
			width,
			height,
			right: width,
			bottom: height,
			x: 0,
			y: 0,
		}),
		getContext: () => createHeadlessGL2(),
		setClientSize: (next_width: number, next_height: number) => {
			width = next_width;
			height = next_height;
			element.clientWidth = width;
			element.clientHeight = height;
		},
		captures: () => captures,
	});

	return element;
}

function pointerEvent(type: string, x: number, y: number): Event {
	return Object.assign(new Event(type, { cancelable: true }), {
		clientX: x,
		clientY: y,
		pointerId: 1,
	});
}

const previous_window = (globalThis as Record<string, unknown>).window;
const previous_resize_observer = (globalThis as Record<string, unknown>).ResizeObserver;

// a ResizeObserver stand-in whose callbacks the tests fire by hand, standing in
// for a browser that notices the element change size
function fakeResizeObserver() {
	const callbacks = new Set<() => void>();

	(globalThis as Record<string, unknown>).ResizeObserver = class {
		private readonly callback: () => void;

		constructor(callback: () => void) {
			this.callback = callback;
		}

		observe(): void {
			callbacks.add(this.callback);
		}

		disconnect(): void {
			callbacks.delete(this.callback);
		}
	};

	return () => {
		for (const callback of callbacks) {
			callback();
		}
	};
}

const fire_resize = fakeResizeObserver();

afterAll(() => {
	(globalThis as Record<string, unknown>).window = previous_window;
	(globalThis as Record<string, unknown>).ResizeObserver = previous_resize_observer;
});

describe("WebCanvasHost", () => {
	test("reports the element size and DPR", () => {
		const window = fakeWindow();
		(globalThis as Record<string, unknown>).window = window;

		const element = fakeElement();
		const host = new WebCanvasHost(element as unknown as HTMLCanvasElement);

		expect(host.css_width).toBe(800);
		expect(host.css_height).toBe(480);
		expect(host.pixel_width).toBe(800);
		expect(host.pixel_height).toBe(480);
		expect(element.width).toBe(800);
		expect(element.height).toBe(480);

		host.dispose();
	});

	test("normalizes pointer, wheel, keyboard, focus, and resize events", () => {
		const window = fakeWindow();
		(globalThis as Record<string, unknown>).window = window;

		const element = fakeElement();
		const host = new WebCanvasHost(element as unknown as HTMLCanvasElement);
		const moves: CanvasHostEventMap["pointermove"][] = [];
		const keys: CanvasHostEventMap["keydown"][] = [];

		host.on("pointermove", (event) => moves.push(event));
		host.on("keydown", (event) => keys.push(event));

		window.dispatchEvent(pointerEvent("pointermove", 40, 80));
		element.dispatchEvent(pointerEvent("pointerdown", 40, 80));
		element.dispatchEvent(pointerEvent("pointerup", 40, 80));

		expect(moves).toEqual([{ x: 40, y: 80, inside: true }]);
		expect(element.captures()).toBe(1);

		const wheel = Object.assign(new Event("wheel", { cancelable: true }), {
			deltaMode: 0,
			deltaY: 16,
		});
		element.dispatchEvent(wheel);

		expect(wheel.defaultPrevented).toBe(true);

		window.dispatchEvent(
			Object.assign(new Event("keydown", { cancelable: true }), {
				key: "j",
				ctrlKey: false,
				altKey: false,
				metaKey: false,
				shiftKey: false,
				repeat: false,
			}),
		);

		expect(keys).toHaveLength(1);
		expect(keys[0]!.key).toBe("j");

		keys[0]!.prevent_default();
		expect(host.focused).toBe(false);

		element.dispatchEvent(new Event("focus"));
		expect(host.focused).toBe(true);
		element.dispatchEvent(new Event("blur"));
		expect(host.focused).toBe(false);

		element.setClientSize(400, 240);
		window.dispatchEvent(new Event("resize"));

		expect(host.css_width).toBe(400);
		expect(host.css_height).toBe(240);

		host.dispose();
	});

	test("follows the element's own resize, not just the window's", () => {
		const window = fakeWindow();
		(globalThis as Record<string, unknown>).window = window;

		const element = fakeElement();
		const host = new WebCanvasHost(element as unknown as HTMLCanvasElement);
		const widths: number[] = [];

		host.on("resize", (event) => widths.push(event.css_width));

		// a stylesheet arriving after construction, or a mobile viewport settling
		element.setClientSize(390, 844);
		fire_resize();

		expect(host.css_width).toBe(390);
		expect(host.css_height).toBe(844);
		expect(element.width).toBe(390);
		expect(widths).toEqual([390]);
	});

	test("ignores the echo of its own backing-store write", () => {
		const window = fakeWindow();
		(globalThis as Record<string, unknown>).window = window;

		window.devicePixelRatio = 3;

		const element = fakeElement();
		const host = new WebCanvasHost(element as unknown as HTMLCanvasElement);

		// an element with no CSS sizing takes its box from the attributes the
		// host writes, so the observer must not treat that as a new size
		element.setClientSize(element.width, element.height);
		fire_resize();

		expect(host.css_width).toBe(800);
		expect(element.width).toBe(2400);
	});

	test("Canvas.from builds a canvas from the element", () => {
		const window = fakeWindow();
		(globalThis as Record<string, unknown>).window = window;

		const element = fakeElement();
		const canvas = Canvas.from(element as unknown as HTMLCanvasElement, {
			palette: new Palette([[0xff, 0x00, 0x00]]),
		});

		expect(canvas.rows).toBe(30);
		expect(canvas.cols).toBe(100);
		expect(canvas.palette[0]).toBe(1);

		canvas.dispose();
	});

	test("Canvas.from throws when WebGL2 is unavailable", () => {
		const window = fakeWindow();
		(globalThis as Record<string, unknown>).window = window;

		const element = fakeElement();

		element.getContext = () => null;

		expect(() => Canvas.from(element as unknown as HTMLCanvasElement)).toThrow(
			"No WebGL2 context",
		);
	});
});

describe("TestCanvasHost", () => {
	test("injects pointer, wheel, key, focus, and resize events", () => {
		const host = new TestCanvasHost({ css_width: 800, css_height: 480 });
		const moves: CanvasHostEventMap["pointermove"][] = [];
		const wheels: CanvasHostEventMap["wheel"][] = [];

		host.on("pointermove", (event) => moves.push(event));
		host.on("wheel", (event) => wheels.push(event));

		host.pointerAtCell(3, 4, 30, 100);
		host.pointerMove(-1, 0);
		host.wheel(16);

		expect(moves).toHaveLength(2);
		expect(moves[0]!.inside).toBe(true);
		expect(moves[1]!.inside).toBe(false);
		expect(wheels).toEqual([{ delta_mode: 0, delta_y: 16 }]);

		host.keyDown("j");
		expect(host.default_prevented).toBe(false);
	});
});

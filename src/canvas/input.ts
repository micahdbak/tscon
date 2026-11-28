import type { Cell } from "../glyphs/cell.ts";

/**
 * A wheel delta mode, matching the DOM `WheelEvent.deltaMode` values.
 *
 * @example
 * ```ts
 * const line_mode: WheelMode = 1;
 * ```
 */
export type WheelMode = 0 | 1 | 2;

/**
 * A normalized keyboard event from a `CanvasHost`.
 *
 * `prevent_default` suppresses the browser's default action for the native
 * event and stops `Canvas`'s built-in keyboard scrolling for that key. A test
 * host records it in `TestCanvasHost.default_prevented` instead.
 *
 * @example
 * ```ts
 * canvas.addEventListener("keydown", (event) => {
 *   const key = (event as CustomEvent<Key>).detail;
 *   key.prevent_default();
 * });
 * ```
 */
export type Key = {
	/** Key name, as reported by the keyboard event. */
	key: string;
	/** Whether the control key was held. */
	ctrl: boolean;
	/** Whether the alt key was held. */
	alt: boolean;
	/** Whether the meta key was held. */
	meta: boolean;
	/** Whether the shift key was held. */
	shift: boolean;
	/** Whether this is a repeat event from a held key. */
	repeat: boolean;
	/** Whether {@link prevent_default} has been called. */
	default_prevented: boolean;
	/** Suppress the native default action for this event. */
	prevent_default: () => void;
};

/**
 * Map a CSS pointer position to a cell within the grid.
 *
 * @example
 * ```ts
 * pointerCell(40, 80, 800, 480, 30, 100); // { row: 5, col: 5 }
 * ```
 *
 * @param x           CSS x offset from the grid's left edge.
 * @param y           CSS y offset from the grid's top edge.
 * @param css_width   Grid width in CSS pixels.
 * @param css_height  Grid height in CSS pixels.
 * @param rows        Number of cell rows.
 * @param cols        Number of cell columns.
 * @returns           The cell under the pointer, or null outside the grid.
 */
export function pointerCell(
	x: number,
	y: number,
	css_width: number,
	css_height: number,
	rows: number,
	cols: number,
): Cell | null {
	if (css_width <= 0 || css_height <= 0) {
		return null;
	}

	if (x < 0 || y < 0 || x >= css_width || y >= css_height) {
		return null;
	}

	return {
		row: Math.floor((y / css_height) * rows),
		col: Math.floor((x / css_width) * cols),
	};
}

/**
 * Convert one wheel delta into rows.
 *
 * Pixel deltas are returned fractionally so the caller can accumulate them
 * across events; the caller should truncate the accumulated value and keep
 * the remainder.
 *
 * @example
 * ```ts
 * wheelRows(0, 16, 16, 30); // 1
 * wheelRows(1, 3, 16, 30);  // 3
 * ```
 *
 * @param delta_mode        Wheel delta mode.
 * @param delta_y           Vertical delta.
 * @param css_cell_height   Cell height, in CSS pixels.
 * @param rows              Number of visible rows, for page deltas.
 * @returns                 Rows to scroll, before accumulation.
 */
export function wheelRows(
	delta_mode: WheelMode,
	delta_y: number,
	css_cell_height: number,
	rows: number,
): number {
	switch (delta_mode) {
		case 0:
			return css_cell_height > 0 ? delta_y / css_cell_height : 0;

		case 1:
			return delta_y;

		case 2:
			return delta_y * rows;
	}

	return 0;
}

/**
 * The wheel rows a held scroll key produces, or `0` for keys that do not
 * scroll.
 *
 * @example
 * ```ts
 * scrollRowsForKey("j"); // 1
 * scrollRowsForKey("k"); // -1
 * ```
 *
 * @param key  Keyboard key name.
 * @returns    Rows to scroll for that key.
 */
export function scrollRowsForKey(key: string): number {
	switch (key) {
		case "j":
		case "ArrowDown":
			return 1;

		case "k":
		case "ArrowUp":
			return -1;

		case "0":
			return -999999;
	}

	return 0;
}

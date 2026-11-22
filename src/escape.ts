const DIGIT = /\d/;

/**
 * A token from {@link scanEscapeAt}, with its source length in `chars`.
 *
 * For anchors, `options` is null for an absent or empty payload. For
 * colours, `num` is the raw digit and `bright` records an uppercase marker.
 *
 * @example
 * ```ts
 * import { scanEscapeAt } from "@micahdb/tscon";
 * import type { EscapeScan } from "@micahdb/tscon";
 *
 * const scan: EscapeScan = scanEscapeAt("\\a0{Foo|bar}Foo", 0);
 * // { kind: "anchor", chars: 12, group: 0, options: "Foo|bar" }
 * ```
 */
export type EscapeScan =
	| { kind: "text"; chars: number }
	| { kind: "clear"; chars: 2 }
	| { kind: "anchor"; chars: number; group: number; options: string | null }
	| { kind: "colour"; chars: number; attribute: "fg" | "bg"; bright: boolean; num: number };

/**
 * Scan the escape sequence (if any) beginning at `index`.
 *
 * Recognised forms:
 *
 * - `\\` -- an escaped backslash, displaying one backslash
 * - `\aX` and `\aX{options}` -- an anchor in group `X` (0-9), with an
 *   optional payload that must close on the same line
 * - `\fX` / `\FX` -- set foreground to colour `X` (dark / bright)
 * - `\bX` / `\BX` -- set background to colour `X` (dark / bright)
 * - `\c` -- restore both theme colours
 *
 * Group and colour indices are single digits. A backslash with an unknown
 * or incomplete escape scans as literal text.
 *
 * @example
 * ```ts
 * import { scanEscapeAt } from "@micahdb/tscon";
 *
 * scanEscapeAt("x\\a0{Foo|bar}y", 1);
 * // { kind: "anchor", chars: 12, group: 0, options: "Foo|bar" }
 * ```
 *
 * @param text  The text to scan, possibly with escape sequences.
 * @param index Source index to scan from. A character that does not begin
 *              an escape scans as `text`.
 * @returns     Which escape it is, how many source characters it
 *              occupies, and its parsed group, payload, or colour.
 */
export function scanEscapeAt(text: string, index: number): EscapeScan {
	if (text[index] !== "\\") {
		return { kind: "text", chars: 1 };
	}

	const marker = text[index + 1];
	const digit = text[index + 2];

	if (marker === "\\") {
		return { kind: "text", chars: 2 };
	}

	if (marker === "c") {
		return { kind: "clear", chars: 2 };
	}

	if (marker === "a" && DIGIT.test(digit ?? "")) {
		return scanAnchor(text, index, Number(digit));
	}

	if (marker !== undefined && "fFbB".includes(marker) && DIGIT.test(digit ?? "")) {
		return {
			kind: "colour",
			chars: 3,
			attribute: marker === "f" || marker === "F" ? "fg" : "bg",
			bright: marker === "F" || marker === "B",
			num: Number(digit),
		};
	}

	return { kind: "text", chars: 1 };
}

function scanAnchor(text: string, index: number, group: number): EscapeScan {
	if (text[index + 3] !== "{") {
		return { kind: "anchor", chars: 3, group, options: null };
	}

	const closing = text.indexOf("}", index + 4);
	const line_end = text.indexOf("\n", index + 4);

	if (closing === -1 || (line_end !== -1 && closing > line_end)) {
		return { kind: "text", chars: 1 };
	}

	const options = text.slice(index + 4, closing);

	return {
		kind: "anchor",
		chars: closing - index + 1,
		group,
		options: options === "" ? null : options,
	};
}

/**
 * Check for any escape recognised by {@link scanEscapeAt}, including an
 * escaped backslash.
 *
 * @example
 * ```ts
 * import { hasEscape } from "@micahdb/tscon";
 *
 * hasEscape("plain text");   // false
 * hasEscape("x\\a0y");       // true
 * hasEscape("back\\slash");  // false: a lone backslash displays itself
 * ```
 *
 * @param text  The text to check.
 * @returns     True when any escape sequence appears in the text.
 */
export function hasEscape(text: string): boolean {
	for (let index = 0; index < text.length; ) {
		const scan = scanEscapeAt(text, index);

		if (scan.kind !== "text" || scan.chars !== 1) {
			return true;
		}

		index += scan.chars;
	}

	return false;
}

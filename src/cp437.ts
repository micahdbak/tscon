/*
╔═══════════ Code Page 437 ══════════╗
║                                    ║
║   ☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼  ║
║   !"#$%&'()*+,-./0123456789:;<=>?  ║
║  @ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_  ║
║  `abcdefghijklmnopqrstuvwxyz{|}~⌂  ║
║  ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒ  ║
║  áíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐  ║
║  └┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀  ║
║  αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■   ║
║                                    ║
╚════════════════════════════════════╝
*/

/**
 * The 256 characters of IBM Code Page 437, as a string indexed by code.
 *
 * Index 0 is a blank (the CP437 NUL is unused) and index 255 is also treated
 * as blank; all other indices 1..254 map to the corresponding CP437 glyph.
 * This is the character set tscon's bitmap font covers and that
 * {@link textGlyphs} encodes glyphs in.
 *
 * NOTE: chars at 0 and 255 are ignored.
 */
export const CP437_CHARS = `\
 ☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼\
 !"#$%&'()*+,-./0123456789:;<=>?\
@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_\
\`abcdefghijklmnopqrstuvwxyz{|}~⌂\
ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒ\
áíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐\
└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀\
αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ `;

let max_code_point = 0;

for (let i = 1; i < 255; i++) {
	const code_point = CP437_CHARS.codePointAt(i)!;

	if (code_point > max_code_point) {
		max_code_point = code_point;
	}
}

const CP437_MAX_CODE_POINT = max_code_point;

// map from any character code point <= CP437_MAX_CODE_POINT to index in CP437
const CP437_MAP = new Uint8Array(CP437_MAX_CODE_POINT + 1);

// populate CP437_MAP
for (let i = 1; i < 255; i++) {
	const code_point = CP437_CHARS.codePointAt(i)!;
	CP437_MAP[code_point] = i;
}

/**
 * Map a Unicode code point to its CP437 index, or `0` if not representable.
 *
 * Characters in {@link CP437_CHARS} are mapped to their index (1..254); any
 * code point above the maximum one present in CP437 (or otherwise absent)
 * returns `0` (blank). This is used internally by {@link textGlyphs} when
 * encoding characters into glyphs.
 *
 * @param code_point  The Unicode code point to look up.
 * @returns           The CP437 index (1..254), or `0` if not representable.
 */
export function charCodeInCp437(code_point: number): number {
	if (code_point > CP437_MAX_CODE_POINT) {
		return 0;
	}

	return CP437_MAP[code_point];
}

/**
 * Render the CP437 character set onto a 2D canvas for use as a font texture.
 *
 * Loads the given `font` CSS string via the Font Loading API, measures an
 * `"A"` glyph to determine per-cell dimensions, then paints all 255 CP437
 * glyphs into a 32-column x 8-row grid on the supplied `canvas` (white on
 * black). Box-drawing characters are replaced with `"@"` placeholders so
 * they are not double-drawn; tscon's built-in bitmap font is used for those.
 *
 * The resulting canvas is intended to be captured (e.g. via `toDataURL` or a
 * WebGL texture upload) to produce an application-provided font texture that
 * can be assigned to {@link Canvas.user_font}.
 *
 * @example
 * ```ts
 * import { renderCp437 } from "@creat/tscon";
 *
 * const canvas = document.getElementById("2d") as HTMLCanvasElement;
 * await renderCp437(canvas, "160px 'JetBrains Mono'");
 * ```
 *
 * @param canvas  The 2D canvas to render onto. Its `width`/`height` are set.
 * @param font    A CSS font string used to render the glyphs.
 */
export async function renderCp437(canvas: HTMLCanvasElement, font: string) {
	await document.fonts.load(font);

	const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

	ctx.font = font;

	const metrics = ctx.measureText("A");
	const padding = 1; // px
	const glyph_width = metrics.width + 2 * padding;
	const glyph_height = 2 * metrics.width + 2 * padding;
	const ascent: number = Math.ceil(metrics.fontBoundingBoxAscent);

	const cols = 32;
	const rows = 8;

	canvas.width = glyph_width * cols;
	canvas.height = glyph_height * rows;

	// fill canvas with black first
	ctx.fillStyle = "black";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// reset these
	ctx.font = font;
	ctx.fillStyle = "white";

	// don't want to draw box drawing characters;
	// the moderndos font will be used for these
	const box_drawing = "░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀";
	const chars = CP437_CHARS.replace(
		box_drawing,
		"@".repeat(box_drawing.length),
	);

	// render all glyphs
	for (let i = 1; i < 255; i++) {
		const x = (i % cols) * glyph_width;
		const y = Math.floor(i / cols) * glyph_height;

		ctx.save();
		ctx.beginPath();
		ctx.rect(
			x + padding,
			y + padding,
			glyph_width - 2 * padding,
			glyph_height - 2 * padding,
		);
		ctx.clip();
		ctx.fillText(
			chars.slice(i, i + 1),
			x + padding,
			y + ascent + padding,
		);
		ctx.restore();
	}
}

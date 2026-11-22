/**
 * The 256 characters of IBM Code Page 437, as a string indexed by code.
 *
 * Indices 0 and 255 are blank. The remaining indices match {@link Glyphs}.
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

const CP437_MAP = new Uint8Array(CP437_MAX_CODE_POINT + 1);

for (let i = 1; i < 255; i++) {
	const code_point = CP437_CHARS.codePointAt(i)!;
	CP437_MAP[code_point] = i;
}

/**
 * Map a Unicode code point to its CP437 index, or `0` if not representable.
 *
 * Characters in {@link CP437_CHARS} are mapped to their index (1..254); any
 * code point above the maximum one present in CP437 (or otherwise absent)
 * returns `0` (blank). {@link Glyphs} uses this to decide which characters
 * the font can draw.
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

// the box-drawing glyphs always come from the built-in bitmap font, so the
// atlas draws a stand-in in their cells rather than a second copy
const BOX_DRAWING = "░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀";
const STAND_IN = "@";

const ATLAS_CHARS = CP437_CHARS.replace(
	BOX_DRAWING,
	STAND_IN.repeat(BOX_DRAWING.length)
);

// the grid the shaders sample the atlas with; changing either breaks them
const ATLAS_COLS = 32;
const ATLAS_ROWS = 8;

// one glyph's ink box, measured against its pen position and baseline
interface GlyphBox {
	readonly glyph: string;
	readonly left: number;
	readonly right: number;
	readonly ascent: number;
	readonly descent: number;
}

// whether the ink lands inside the cell when the glyph is drawn at the pen
function fitsCell(box: GlyphBox, width: number, above: number, below: number): boolean {
	return -box.left >= 0 && box.right <= width && box.ascent <= above && box.descent <= below;
}

/**
 * Render the CP437 character set onto a 2D canvas for use as a font texture.
 *
 * The atlas has 32 columns and 8 rows and stores white glyphs on black.
 * Cell dimensions depend on measured glyphs and can vary by platform.
 * Glyphs that exceed the cell bounds are scaled to fit. The atlas uses
 * placeholders for codes 176-223 because the terminal draws those from
 * the built-in bitmap.
 *
 * Upload the finished canvas as a texture for {@link Canvas.user_font}.
 *
 * @example
 * ```ts
 * import { renderCp437 } from "@micahdb/tscon";
 *
 * const canvas = document.getElementById("2d") as HTMLCanvasElement;
 * await renderCp437(canvas, "160px 'JetBrains Mono'");
 * ```
 *
 * @param canvas  The 2D canvas to render onto. Its `width`/`height` are set.
 * @param font    A CSS font string used to render the glyphs.
 * @returns       A promise that resolves after the atlas has been painted.
 */
export async function renderCp437(canvas: HTMLCanvasElement, font: string) {
	await document.fonts.load(font);

	const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

	ctx.font = font;

	const padding = 1; // px
	const inner_width = Math.ceil(ctx.measureText("A").width);
	const boxes: GlyphBox[] = [];

	// the cell is sized from the ink the glyphs actually paint, since a fallback
	// font for an uncovered character can reach well outside the font's metrics
	for (let i = 1; i < 255; i++) {
		const glyph = ATLAS_CHARS.slice(i, i + 1);
		const measured = ctx.measureText(glyph);

		boxes.push({
			glyph,
			left: measured.actualBoundingBoxLeft,
			right: measured.actualBoundingBoxRight,
			ascent: measured.actualBoundingBoxAscent,
			descent: measured.actualBoundingBoxDescent,
		});
	}

	const ascent = Math.ceil(Math.max(...boxes.map((box) => box.ascent)));
	const descent = Math.ceil(Math.max(...boxes.map((box) => box.descent)));

	// cells keep the 8x16 shape of the terminal's cells unless the ink needs more
	const inner_height = Math.max(ascent + descent, 2 * inner_width);
	const glyph_width = inner_width + 2 * padding;
	const glyph_height = inner_height + 2 * padding;

	// centring the ink box in the cell leaves the padding and the neighbouring
	// cells untouched whatever the glyphs' metrics turn out to be
	const baseline = padding + (inner_height - (ascent + descent)) / 2 + ascent;
	const above = baseline - padding;
	const below = inner_height - above;

	canvas.width = glyph_width * ATLAS_COLS;
	canvas.height = glyph_height * ATLAS_ROWS;

	// resizing the canvas resets the context, so state is set after it
	ctx.font = font;
	ctx.fillStyle = "black";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "white";

	for (const [i, box] of boxes.entries()) {
		const code = i + 1;
		const x = (code % ATLAS_COLS) * glyph_width;
		const y = Math.floor(code / ATLAS_COLS) * glyph_height;
		const ink_width = box.left + box.right;
		const ink_height = box.ascent + box.descent;

		ctx.save();
		ctx.beginPath();
		ctx.rect(x, y, glyph_width, glyph_height);
		ctx.clip();

		if (fitsCell(box, inner_width, above, below)) {
			ctx.fillText(box.glyph, x + padding, y + baseline);
		} else {
			// a glyph that overhangs its cell is fitted to it and recentred
			const scale = Math.min(1, inner_width / ink_width, inner_height / ink_height);
			const offset = (inner_width - scale * ink_width) / 2 + scale * box.left;

			ctx.translate(x + padding + offset, y + baseline);
			ctx.scale(scale, scale);
			ctx.fillText(box.glyph, 0, 0);
		}

		ctx.restore();
	}
}

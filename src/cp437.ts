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

// all characters in code page 437
// NOTE: chars at 0 and 255 are ignored
// prettier-ignore
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

export function charCodeInCp437(code_point: number): number {
	if (code_point > CP437_MAX_CODE_POINT) {
		return 0;
	}

	return CP437_MAP[code_point];
}

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

	// reset these
	ctx.font = font;
	ctx.fillStyle = "white";

	// don't want to draw box drawing characters;the moderndos font will be used for these
	const box_drawing = "░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀";
	const chars = CP437_CHARS.replace(
		box_drawing,
		"@".repeat(box_drawing.length),
	);

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
		ctx.fillText(chars.slice(i, i + 1), x + padding, y + ascent + padding);
		ctx.restore();
	}
}

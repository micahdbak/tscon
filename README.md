# @micahdb/tscon

Render text and textures on a WebGL2 canvas arranged as a grid of character
cells. Text uses the CP437 character set and inline escapes for colours and
application-defined anchors.

## Install

```sh
bun add @micahdb/tscon
# or
npm install @micahdb/tscon
```

## Draw a frame

Give the canvas a size in CSS. `Canvas.from` creates the browser host and throws
if WebGL2 is unavailable.

```ts
import { Canvas, Glyphs, Terminal } from "@micahdb/tscon";

const canvas = Canvas.from(document.querySelector("canvas")!);
const terminal = new Terminal(canvas);
const glyphs = new Glyphs("Hello, tscon!", canvas.cols);
const region = { row: 0, col: 0, rows: glyphs.rows, cols: glyphs.cols };

canvas.clear();
terminal.clear();
terminal.blit(glyphs, region, region);
terminal.draw();
```

Grid positions are zero-based. Regions give the top-left cell and size as
`{ row, col, rows, cols }`. The default grid fits whole multiples of 8x16 device
pixels per cell and leaves unused space on the right and bottom. Pass
`{ stretch: true }` to fill the canvas with potentially fractional cell sizes.
Canvases too small for one 8x16 cell use the full-canvas grid.

Reuse compiled glyphs until the text or available width changes. Listen for
`"resize"` to rebuild layouts when `canvas.rows` or `canvas.cols` changes.

## Text and anchors

| Escape | Meaning |
| --- | --- |
| `\fX` / `\FX` | Set foreground to dark / bright palette colour `X` (0-7). |
| `\bX` / `\BX` | Set background to dark / bright palette colour `X` (0-7). |
| `\c` | Restore both theme colours. |
| `\aX` / `\aX{options}` | Mark the next visible cell in group `X` (0-9). |
| `\\` | Display a backslash. |

A backslash immediately before a newline joins the lines. Tabs advance to the
next tab stop. `Glyphs` uses word wrap by default. Pass `Wrap.HARD` to break at
the column limit, `Wrap.TRUNCATE` to discard overflow, or `{ raw: true }` to
show escape syntax literally. Use `textToLines` when you only need the wrapped
text.

Anchors take no columns. Their payload is application data and its closing brace
must be on the same line. Use the compiled positions to place links, images, or
other overlays. Source indices are offsets in the original JavaScript string,
including escapes.

```ts
import { Glyphs } from "@micahdb/tscon";

const glyphs = new Glyphs("Click \\a0{here|#}here", 40);

glyphs.anchors[0]![0]!;  // { options: "here|#", row: 0, col: 6, index: 17 }
glyphs.renderedCell(17); // { row: 0, col: 6 }
glyphs.cursorIndex(0, 9); // 20
glyphs.spansFor(17, 21); // [{ row: 0, from: 6, to: 10 }]
```

## Colours and cell data

A `Palette` holds RGB byte triples indexed by `Colour`. Entries 0-15 are the
explicit colours. Unstyled text starts with `Colour.FG` (16) and `Colour.BG`
(17), and `Canvas.clear()` uses `Colour.BG`. Foreground and background escapes
change their channels independently. Pass `{ palette }` to `Canvas.from` or call
`canvas.setPalette(palette)` at runtime. Omitted entries use `DEFAULT_COLOURS`.

`Glyphs.data` holds one 32-bit word per cell. Use `packCell` and `unpackCell` to
read or write the character and colour indices. Use `Glyphs.mapCells` to derive
a grid for an overlay while keeping its source positions and anchors.

An all-zero word draws nothing. A space with a background colour paints that
background. Return `0` from `mapCells` to make a cell transparent.

## Textures and fonts

Use `textureGlyphs(rows, cols, mode)` to prepare a grid for `Renderer.draw`.
Choose `TexGlyphMode.SAMPLE` to display the source image, `GLYPHS` for coloured
characters on the theme background, or `BG_GLYPHS` to colour both parts of the
cell. The destination must match the grid's size. Pass the full destination even
when it extends off canvas so clipping preserves the texture mapping.

```ts
import { loadTexture, Renderer, TexGlyphMode, textureGlyphs } from "@micahdb/tscon";

const renderer = new Renderer(canvas);
const image = await loadTexture(canvas.gl, "/images/portrait.jpg");
const grid = textureGlyphs(12, 24, TexGlyphMode.SAMPLE);

renderer.draw(grid, image, { row: 0, col: 0, rows: 12, cols: 24 });
```

Draw background textures after `canvas.clear()` and before `terminal.draw()`. If
an offscreen pass changes the WebGL viewport, restore the previous viewport
before drawing the grid.

The built-in Modern DOS bitmap uses nearest-neighbour sampling. For a custom
font, use `renderCp437` to generate an atlas and upload it as a texture. Assign
it to `canvas.user_font` and set `use_user_font = true` on each terminal or
renderer that uses it. Custom glyphs are anti-aliased. CP437 codes 176-223 use
the built-in bitmap in either mode.

## Input and headless tests

`Canvas` converts pointer positions to cells and emits `"wheel"` in whole rows.
Call `event.detail.prevent_default()` in a `"keydown"` listener to intercept
built-in keyboard scrolling. Call `canvas.dispose()` to remove host listeners.

Use `new Canvas(host, gl)` to inject a host and context. For tests, combine
`TestCanvasHost` with `createHeadlessGL2()` and exercise the real terminal or
renderer. Assert on compiled cells, events, or draw calls. Pixel checks need a
WebGL2 browser.

## Development

```sh
bun install
bun test
bun run typecheck
bun run lint
bun run build
```

Run `bun run shaders` after changing `shaders/` to regenerate `src/shaders.ts`.
The build emits JavaScript and declarations in `dist/`.

## License

MIT

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

## Import

Import the package as a namespace and use `tscon.*` in application code:

```ts
import * as tscon from "@micahdb/tscon";
```

## Draw a frame

Give the canvas a size in CSS. `tscon.Canvas.from` creates the browser host and
throws if WebGL2 is unavailable.

```ts
import * as tscon from "@micahdb/tscon";

const element = document.querySelector<HTMLCanvasElement>("canvas")!;
const canvas = tscon.Canvas.from(element);
const terminal = new tscon.Terminal(canvas);
const glyphs = new tscon.Glyphs("Hello, tscon!", canvas.cols);
const region: tscon.Rect = {
  row: 0,
  col: 0,
  rows: glyphs.rows,
  cols: glyphs.cols,
};

canvas.clear();
terminal.clear();
terminal.blit(glyphs, region, region);
terminal.draw();
```

Grid positions are zero-based. Regions use `tscon.Rect`
`{ row, col, rows, cols }`. The default grid fits whole multiples of 8x16 device
pixels per cell and leaves unused space on the right and bottom. Pass
`{ stretch: true }` in `tscon.CanvasOptions` to fill the canvas with potentially
fractional cell sizes. Canvases too small for one 8x16 cell use the full-canvas
grid.

Reuse compiled glyphs until the text or available width changes. Listen for
`"resize"` to rebuild layouts when `canvas.rows` or `canvas.cols` changes.

## Text, layout, and anchors

| Escape | Meaning |
| --- | --- |
| `\fX` / `\FX` | Set foreground to dark / bright palette colour `X` (0-7). |
| `\bX` / `\BX` | Set background to dark / bright palette colour `X` (0-7). |
| `\c` | Restore both theme colours. |
| `\aX` / `\aX{options}` | Mark the next visible cell in group `X` (0-9). |
| `\\` | Display a backslash. |

A backslash immediately before a newline joins the lines. Tabs advance to the
next `tscon.TAB_WIDTH` stop. `tscon.Glyphs` uses word wrap by default. Pass
`tscon.Wrap.HARD` to break at the column limit, `tscon.Wrap.TRUNCATE` to discard
overflow, or `{ raw: true }` in `tscon.TextOptions` to show escape syntax
literally.

`tscon.textToLines` returns the wrapped strings. `tscon.layoutText` returns a
`tscon.TextLayout` with the rows, each row's start index, and a source map. Use
`tscon.hasEscape` to test for escapes and `tscon.scanEscapeAt` to read one
escape as a `tscon.EscapeScan`.

```ts
import * as tscon from "@micahdb/tscon";

const lines = tscon.textToLines("hello world", 5);
// ["hello", "world"]

const layout = tscon.layoutText("hello world", 5, { wrap: tscon.Wrap.WORD });
// layout.pieces: ["hello", "world"]
// layout.starts: [0, 6]
```

An anchor marks the next visible cell and has no closing escape. Its payload is
application data and its closing brace must be on the same line. Each
`tscon.Anchor` records the visible cell it marks and the source range of its
escape. Source indices are offsets in the original string, including escapes.

```ts
import * as tscon from "@micahdb/tscon";

const glyphs = new tscon.Glyphs("\\a0{options}text", 40);

glyphs.anchors[0]![0]!;
// { options: "options", row: 0, col: 0, index: 12, start: 0, end: 12 }
glyphs.renderedCell(12); // { row: 0, col: 0 }
glyphs.cursorIndex(0, 1); // 13
[...glyphs.spansFor(12, 16)]; // [{ row: 0, from: 0, to: 4 }]
```

`glyphs.spansFor` returns `tscon.Spans`, a selection of `tscon.Span` runs over
the grid. Use `contains` for hit testing, `equals` to compare run geometry,
`mapCells` to decorate selected cells, and `blit` to copy the runs to a terminal
at an origin. Iterate the selection to inspect its runs.

## Colours and cells

A `tscon.Palette` holds RGB byte triples (`tscon.Rgb`) indexed by
`tscon.Colour`. Entries 0-15 are the explicit colours. Unstyled text starts with
`tscon.Colour.FG` (16) and `tscon.Colour.BG` (17), and `canvas.clear()` uses
`tscon.Colour.BG`. Foreground and background escapes change their channels
independently. Pass `{ palette }` to `tscon.Canvas.from` or call
`canvas.setPalette(palette)` at runtime. Omitted entries use
`tscon.DEFAULT_COLOURS`.

`glyphs.data` holds one 32-bit word per cell. Use `tscon.packCell` and
`tscon.unpackCell` to read or write the `tscon.Cell` and `tscon.CellAttributes`
fields.

```ts
import * as tscon from "@micahdb/tscon";

const cell = tscon.packCell(65, tscon.Colour.FG, tscon.Colour.BG);
const { char_code, foreground, background } = tscon.unpackCell(cell);
```

An all-zero word draws nothing. A space with a background colour paints that
background. Return `0` from `mapCells` to make a cell transparent.

`tscon.CP437_CHARS` is the 256-character CP437 string indexed by code.
`tscon.charCodeInCp437` maps a Unicode code point to that index, or `0` when the
character is not representable.

## Textures, fonts, and renderer

Use `tscon.textureGlyphs(rows, cols, mode)` to prepare a `tscon.TexGlyphs` grid
for `tscon.Renderer.draw`. Choose `tscon.TexGlyphMode.SAMPLE` to display the
source image, `GLYPHS` for coloured characters on the theme background, or
`BG_GLYPHS` to colour both parts of the cell. The destination must match the
grid size. Pass the full destination even when it extends off canvas so clipping
preserves the texture mapping.

```ts
import * as tscon from "@micahdb/tscon";

const renderer = new tscon.Renderer(canvas);
const image = await tscon.loadTexture(canvas.gl, "/images/portrait.jpg");
const grid = tscon.textureGlyphs(12, 24, tscon.TexGlyphMode.SAMPLE);

renderer.draw(grid, image, { row: 0, col: 0, rows: 12, cols: 24 });
```

`tscon.loadCubeMap` loads six images into a cube-map texture for custom shader
pipelines. Draw background textures after `canvas.clear()` and before
`terminal.draw()`. If an offscreen pass changes the WebGL viewport, restore the
previous viewport before drawing the grid.

The built-in Modern DOS bitmap uses nearest-neighbour sampling. For a custom
font, use `tscon.renderCp437` to generate an atlas and upload it as a texture.
Assign it to `canvas.user_font` and set `use_user_font = true` on each terminal
or renderer that uses it. Custom glyphs are anti-aliased. CP437 codes 176-223
use the built-in bitmap in either mode.

## Input and headless tests

`tscon.Canvas` converts pointer positions to cells and emits `"wheel"` in whole
rows. `tscon.Key` and `tscon.WheelMode` describe those input values.
`tscon.CanvasHost` and `tscon.CanvasHostEventMap` define the host surface. Call
`event.detail.prevent_default()` in a `"keydown"` listener to intercept built-in
keyboard scrolling. Call `canvas.dispose()` to remove host listeners.

`tscon.WebCanvasHost` backs a canvas with an `HTMLCanvasElement`.
`tscon.TestCanvasHost` injects size and input events without the DOM.
`tscon.HeadlessGL2` and `tscon.createHeadlessGL2()` provide a no-op WebGL2
context. For tests, combine `tscon.TestCanvasHost` with
`tscon.createHeadlessGL2()` and exercise the real terminal or renderer. Assert
on compiled cells, events, or draw calls. Pixel checks need a WebGL2 browser.

```ts
import * as tscon from "@micahdb/tscon";

const host = new tscon.TestCanvasHost({ css_width: 800, css_height: 480 });
const canvas = new tscon.Canvas(host, tscon.createHeadlessGL2());
```

## Math and GL helpers

`tscon.Mat4` and `tscon.Vec4` provide column-major matrix and vector helpers for
custom rendering passes. `tscon.compileProgram`, `tscon.getAttribLocations`, and
`tscon.getUniformLocations` build and inspect WebGL2 programs.

```ts
import * as tscon from "@micahdb/tscon";

const projection = tscon.Mat4.create();
tscon.Mat4.perspective(projection, Math.PI / 3, 16 / 9, 0.1, 100);

const point = tscon.Vec4.from(1, 2, 3, 1);
tscon.Vec4.transformMat4(point, point, tscon.Mat4.translation(1, 0, 0));
```

## Development

```sh
bun install
bun test
bun run typecheck
bun run lint
bun run build
```

Run `bun run shaders` after changing `shaders/` to regenerate
`src/renderer/shaders.ts` and `src/terminal/shaders.ts`. The build emits
JavaScript and declarations in `dist/`.

## License

MIT

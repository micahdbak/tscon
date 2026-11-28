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

## Quick start

Give the canvas element a size in CSS.

This creates a browser canvas, a terminal, and one line of text:

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

const loop = () => {
  canvas.clear();
  terminal.clear();
  terminal.blit(glyphs, region, region);
  terminal.draw();
  requestAnimationFrame(loop);
}
loop();
```

Grid positions are zero-based. Regions use `tscon.Rect`
`{ row, col, rows, cols }`. Reuse compiled glyphs until the text or available
width changes. Listen for `"resize"` to rebuild layouts when `canvas.rows` or
`canvas.cols` changes.

## Canvas setup

`tscon.Canvas.from(element, options?)` is the shortest browser setup. It creates
a `tscon.WebCanvasHost`, acquires a WebGL2 context, and throws when WebGL2 is
unavailable.

Use the constructor when you already have a WebGL2 context or want to supply
your own host:

```ts
const host = new tscon.WebCanvasHost(element);
const gl = element.getContext("webgl2");

if (!gl) {
  throw new Error("WebGL2 is unavailable");
}

const canvas = new tscon.Canvas(host, gl);
```

`tscon.CanvasHost` is the interface a canvas uses to read size and input.
`tscon.WebCanvasHost` is the built-in browser implementation.
`tscon.TestCanvasHost` provides a DOM-free host for tests. You can supply a
custom `CanvasHost` when the browser element is not the right input source.

Both `Canvas.from` and the constructor accept optional `tscon.CanvasOptions`:

- `palette`: initial `tscon.Palette`. Defaults to `tscon.DEFAULT_COLOURS`.
  Missing entries use the defaults. Change it later with `canvas.setPalette`.
- `stretch`: fill the canvas with equal-sized cells, allowing fractional cell
  sizes. Defaults to false, which uses whole multiples of 8x16 device pixels and
  leaves any extra space on the right and bottom. Canvases smaller than one 8x16
  cell use the full-canvas grid either way. The base cell size is
  `tscon.Canvas.CELL_WIDTH` by `tscon.Canvas.CELL_HEIGHT`.
- `interactive`: handle pointer, wheel, and keyboard input. Defaults to true.
  Set it to false for a render-only canvas. It then handles no input, prevents
  no browser defaults, removes the `tabindex` added for keyboard focus, and
  leaves `mouse_row`, `mouse_col`, and click state idle.

```ts
const canvas = tscon.Canvas.from(element, {
  palette: new tscon.Palette(my_colours),
  stretch: true,
  interactive: false,
});
```

Omitted options use their defaults. The resolved interactive setting is
available as `canvas.interactive`.

`canvas.width` and `canvas.height` are device-pixel sizes. `canvas.rows` and
`canvas.cols` are the grid size. `canvas.actual_cell_width` and
`canvas.actual_cell_height` are the current cell sizes. Call `canvas.dispose()`
to remove host listeners.

## Terminal and text

A `tscon.Terminal` renders compiled glyphs into the canvas grid. It follows the
current `canvas.rows` and `canvas.cols`.

```ts
const terminal = new tscon.Terminal(canvas);
const glyphs = new tscon.Glyphs("Hello, tscon!", canvas.cols);
const region = { row: 0, col: 0, rows: glyphs.rows, cols: glyphs.cols };

terminal.clear();
terminal.blit(glyphs, region, region);
terminal.draw();
```

`terminal.clear()` resets the cell buffer and `detail_text`.
`terminal.blit(glyphs, src, dst)` copies one region of a glyph grid into the
buffer. Source and destination sizes must match. Blits clip at the canvas edges,
and later blits replace earlier cells. `terminal.draw()` rasterises the buffer.
Zero-valued cells are transparent and leave the pixels beneath visible.

`terminal.detail_text` draws text on the bottom row during `draw`. Assign an
empty string to clear it.

## Renderer and textures

A `tscon.Renderer` draws a texture directly or as coloured characters. Use
`tscon.textureGlyphs` to prepare the sampling grid.

```ts
const renderer = new tscon.Renderer(canvas);
const image = await tscon.loadTexture(canvas.gl, "/images/portrait.jpg");
const grid = tscon.textureGlyphs(12, 24, tscon.TexGlyphMode.SAMPLE);

renderer.draw(grid, image, { row: 0, col: 0, rows: 12, cols: 24 });
```

`tscon.textureGlyphs(rows, cols, mode)` returns a `tscon.TexGlyphs` grid. Choose
`tscon.TexGlyphMode.SAMPLE` to display the source image, `GLYPHS` for coloured
characters on the theme background, or `BG_GLYPHS` to colour both parts of the
cell. `MIX`, `ROWS`, and `COLS` alternate `SAMPLE` and `GLYPHS` by cell, row, or
column.

The destination must match the grid size. Pass the full destination even when it
extends off canvas so clipping preserves the texture mapping. Draw textures
after `canvas.clear()` and before `terminal.draw()`.

`tscon.loadCubeMap` loads six images into a cube-map texture for custom shader
pipelines. If an offscreen pass changes the WebGL viewport, restore the previous
viewport before drawing the grid.

### Fonts

The built-in Modern DOS bitmap uses nearest-neighbour sampling and is available
as `canvas.bitmap_font`. For a custom font, use `tscon.renderCp437` to generate
an atlas and upload it as a texture. Assign it to `canvas.user_font` and set
`use_user_font = true` on each terminal or renderer that uses it. Custom glyphs
are anti-aliased. CP437 codes 176-223 use the built-in bitmap in either mode.

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

`glyphs.sourceText` keeps the original string, `glyphs.wrappedText` holds the
laid-out rows, and `glyphs.rowCols(row)` gives a row's visible width.
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
`tscon.DEFAULT_COLOURS`. `palette.toFloats()` returns the 54-entry shader array.
`canvas.paletteColour(colour)` returns one entry as normalised RGB floats for
WebGL calls.

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

## Pointer and clicks

`canvas.mouse_row` and `canvas.mouse_col` identify the cell under the pointer,
or `undefined` outside the grid. Use `canvas.mouseAt` for hover hit-testing and
`canvas.mouseDownAt` for press-origin hit-testing.

`canvas.click` is always a `tscon.Click`. While the button is down, it is
incomplete: `down_row` and `down_col` are set, and `row` and `col` are
undefined. A release inside the grid fills `row` and `col`; a release outside
the grid cancels the click. `consume()` returns false while the click is
incomplete. Hit-test the click, then call `consume()` before acting so only one
component handles it.

Call `canvas.click.clear()` after all click handlers have run. It clears a
complete click and does nothing while the pointer is down.

Use `canvas.click.claim(owner)` for drag-style interactions. Call it while
`click.pressed()` is true. It returns false when another component owns the
pointer. An owned click cannot be consumed. The owner remains set until
`canvas.click.release(owner)` or `clear()`. `canvas.click.owner` reads the
current owner.

```ts
const click = canvas.click;

if (click.pressed() && click.claim("editor")) {
  // start a drag
}

if (click.consume()) {
  // click.row and click.col: release cell
  // click.down_row and click.down_col: press cell
}

click.clear();
```

## Focus and keyboard input

This behavior requires `interactive: true`, the default. With
`interactive: false`, no key events are delivered and no browser defaults are
prevented.

`tscon.Canvas.from` makes the browser canvas focusable when it has no
`tabindex`. Pressing the pointer on the canvas focuses it; `canvas.focus()` and
`canvas.blur()` control focus directly. `"keydown"` and `"keyup"` only fire
while the canvas is focused. Their `detail` is a `tscon.Key` with `key`, `ctrl`,
`alt`, `meta`, `shift`, `repeat`, `default_prevented`, and `prevent_default()`.

Keys aimed at inputs, textareas, or contenteditable elements are ignored. While
focused, the canvas consumes Ctrl/Cmd+A/C/F/G so page select, copy, and find do
not act on the page. Built-in scrolling handles j/ArrowDown, k/ArrowUp, and 0
when the canvas is focused or the pointer is over it, and emits a `"wheel"`
event. Call `key.prevent_default()` in a `"keydown"` listener to stop both the
browser action and the built-in scroll for that key.

```ts
import * as tscon from "@micahdb/tscon";

canvas.focus();

canvas.addEventListener("keydown", (event) => {
  const key = (event as CustomEvent<tscon.Key>).detail;

  if (key.key === "Enter") {
    key.prevent_default();
  }
});
```

## Headless tests

`tscon.Canvas` converts pointer positions to cells and emits `"wheel"` in whole
rows. `tscon.WheelMode` describes the wheel delta mode. `tscon.CanvasHost`
exposes element size, DPR, focus state, `focus`, `blur`, `on`, and `dispose`;
`tscon.CanvasHostEventMap` lists the event payloads. Call `canvas.dispose()` to
remove host listeners.

`tscon.TestCanvasHost` injects size, pointer, wheel, key, focus, and resize
events without the DOM. Use its `keyDown`/`keyUp`, `focus`/`blur`, and
`default_prevented` members to test keyboard behavior. `tscon.HeadlessGL2` and
`tscon.createHeadlessGL2()` provide a no-op WebGL2 context. For tests, combine
`tscon.TestCanvasHost` with `tscon.createHeadlessGL2()` and exercise the real
terminal or renderer. Assert on compiled cells, events, or draw calls. Pixel
checks need a WebGL2 browser.

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

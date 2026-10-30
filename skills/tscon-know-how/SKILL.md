---
name: tscon-know-how
description: >-
  How to build, debug, and explain apps using the @micahdb/tscon WebGL2
  text-mode graphics library.
---

# Using @micahdb/tscon

tscon draws a `<canvas>` as a grid of fixed character cells. Text is written
once in a small escape format, compiled into that grid, and drawn; textures can
be drawn into the same grid, either as themselves or converted into coloured
characters. Install `@micahdb/tscon` and import from the package root. Exact
signatures and per-API doc comments live in the installed package
(`node_modules/@micahdb/tscon/dist/*.d.ts`); consult them for signatures. This
skill carries what they do not state: the mental model, the behavioural
contracts, and the downstream practices.

API map (roles, not signatures):

- **`Canvas`**: owns the cell-grid dimensions, the palette, the built-in font
  plus an optional application font, WebGL resources, and all mouse, wheel, and
  keyboard state. Construct it with a `CanvasHost` and a WebGL2 context, or use
  `Canvas.from(element)` for browser boot. Use `Canvas.from(element, { palette })`
  or `canvas.setPalette(...)` to change colours.
- **Hosts and testing**: `CanvasHost` reports element size, DPR, focus, and
  normalized pointer/wheel/key events. `WebCanvasHost` is the browser
  implementation; `TestCanvasHost` injects events for headless tests.
  `HeadlessGL2` / `createHeadlessGL2()` provide a no-op WebGL2 context.
- **Text**: `Glyphs` compiles escape-formatted text into a cell grid and answers
  where anything in the text ended up (`renderedCell`, `cursorCell`,
  `cursorIndex`, `rowCols`, `spansFor`, `mapCells`). `textToLines` does the
  layout alone, returning strings. Options are `TextOptions` (`wrap`, `raw`),
  with `Wrap.WORD` / `Wrap.TRUNCATE` / `Wrap.HARD`. Supporting types: `Cell`,
  `CellSpan`, `Anchor`, `Rect`, `Colour`, `DEFAULT_COLOURS`, `Palette`, `TAB_WIDTH`.
- **Escapes**: `scanEscapeAt` and `hasEscape` inspect the escape format without
  compiling anything (`EscapeScan` describes what they find).
- **Presenters**: `Terminal` draws a cell grid; `Renderer` with `textureGlyphs`
  and `TexGlyphMode` draws a texture as cells. Both draw onto a `Canvas`.
- **3D support**: `Mat4` / `Vec4`, `compileProgram` / `getAttribLocations` /
  `getUniformLocations`, `loadTexture` / `loadCubeMap`, and `renderCp437`
  (custom font atlas generation).

## The four paradigms

Everything in tscon follows from four decisions. Internalize them before the
API.

1. **Cell-grid thinking.** There are no pixels downstream. Layout, hit-testing,
   scrolling, and regions (`Rect`) are all integer `{row, col, rows, cols}`. The
   screen is `canvas.rows` by `canvas.cols` cells of roughly 8x16 CSS px
   (`Canvas.CELL_WIDTH/CELL_HEIGHT`). If you want sub-cell precision, you are
   fighting the paradigm; reposition by cells instead.
2. **Text-as-data.** Content is a plain string with escape sequences
   (`\fX`/`\FX`/`\bX`/`\BX` colours, `\aX{...}` anchors, `\\`, backslash-newline
   continuation, tabs, word wrap). `new Glyphs(text, cols, opts?)` compiles it
   once per width into a grid that is both the cells to draw and the answer to
   "where is this character on screen". Styling lives in the text, not in code.
   Escape digits clamp (colours to 0-7 with `F`/`B` adding 8, anchor groups to
   0-9) and characters outside CP437 draw blank. An `\aN` anchor marks the cell
   of the character that follows it; a `{...}` payload must close on its own
   line, or the anchor draws as raw text.
3. **Compile once, draw every frame.** Compiling text is the only expensive
   step, so compile when the text or the width changes -- at boot and on resize
   -- never per frame. Per frame you blit already-compiled grids and draw once.
   Textures follow the same rule: build a `textureGlyphs` grid per size, not per
   frame.
4. **Anchors as the interaction bridge.** `\aX{options}` occupies zero columns
   but records `{row, col, options}` into `Glyphs.anchors[X]`; whatever string
   sits between the braces comes back verbatim as the anchor's `options` field
   (or `null` when the braces are absent or empty). Downstream code turns those
   positions into live components (links, headings, image slots) by hit-testing
   cell rects at the anchor position and blitting its own glyphs over them.
   Anchor group digits and options conventions (e.g. `text|url`) are app-defined
   channels.

```ts
import { Glyphs, Wrap } from "@micahdb/tscon";

const g = new Glyphs("Hi \\a0{Docs|#docs}Docs", 20);

g.rows;                    // 1
g.anchors[0]![0]!.options; // "Docs|#docs"
g.anchors[0]![0]!.col;     // 3: the cell "D" draws in
g.renderedCell(18);        // { row: 0, col: 3 }: where "D" draws
g.renderedCell(13);        // null: index 13 is inside the anchor
g.cursorIndex(0, 5);       // 20: the source character under that cell
g.spansFor(18, 22);        // [{ row: 0, from: 3, to: 7 }]
g.rowCols(0);              // 7
```

## How it behaves

### Blank cells are transparent

A cell that draws nothing -- a space on the default colours, or a cell you
blanked with `mapCells` -- paints nothing at all. Everything drawn earlier shows
through it. This is what lets text float over a texture: draw the texture first,
then the text, and only the characters appear. Trailing spaces on a line are
blank for this reason, so a grid does not paint a black bar to the right of its
text.

### Blit, then draw

Compositing is explicit and ordered. `terminal.blit(glyphs, src, dst)` copies a
region of one grid into the frame: `src` and `dst` must be the same size
(`rows` and `cols` both), or nothing is drawn; `dst` may start outside the
canvas and is clipped. `src` lets you blit a sub-rectangle of a larger grid.
`terminal.draw()` is called once per frame after every blit and presents the
whole frame. Blit order is paint order: later blits cover earlier ones.

```ts
const g = new Glyphs("title", 5);

// slice row 0 of the grid onto the screen at row 2, column 4
terminal.blit(g,
    { row: 0, col: 0, rows: 1, cols: 5 },
    { row: 2, col: 4, rows: 1, cols: 5 });
```

`renderer.draw(tglyphs, texture, dst)` follows the same contract, with one
important consequence: pass the **whole** grid and let `dst` extend past the
canvas, because off-screen cells are clipped for you. Slicing a grid to fit a
visible region yourself changes what each cell shows, so a scrolled or
partly-offscreen texture will smear or distort. Guard only the fully-offscreen
case.

### Fonts

- The **built-in bitmap font** covers CP437 and is used for everything by
  default. Box-drawing and shade characters always come from it.
- An **application font** is optional: generate an atlas from any CSS font with
  `renderCp437(offscreen2dCanvas, cssFont)`, upload it with `loadTexture`, assign
  it to `canvas.user_font`, then set `terminal.use_user_font = true` /
  `renderer.use_user_font = true`. Those flags fall back to the built-in font
  while `canvas.user_font` is null, so async loading is safe: hold the texture in
  a nullable field and assign it inside the frame loop once it resolves.

### Palette

The palette is 16 `[R, G, B]` byte triples ordered by `Colour`.
`DEFAULT_COLOURS` is the default. Supply an initial palette with `Canvas.from(element, { palette })`
or `new Canvas(host, gl, { palette })`, and replace it at runtime with
`canvas.setPalette(palette)`. Entries beyond the supplied array use `DEFAULT_COLOURS`;
channels are clamped to `0`-`255` and rounded. `Terminal` and `Renderer` apply
the current palette on every draw, and `Canvas.clear` uses palette entry 0 as
the background.

```ts
import { Canvas, Colour, DEFAULT_COLOURS, Palette } from "@micahdb/tscon";

const palette = new Palette(DEFAULT_COLOURS);
palette.colours[Colour.RED] = [0xff, 0x00, 0x00];

const canvas = Canvas.from(element, { palette });
canvas.setPalette(new Palette([[0x08, 0x08, 0x08], [0xff, 0x00, 0x00]]));
```

### Textures as cells

`textureGlyphs(rows, cols, mode)` builds a grid for a region of exactly that
size. Keep grids at or under 256 rows, which is also the canvas's row cap.
`TexGlyphMode` decides what the texture looks like:

- `SAMPLE`: the texture as it is. Use for images that must stay photographic.
- `GLYPHS`: the texture as coloured characters on black. Use under text.
- `BG_GLYPHS`: like `GLYPHS` but the character backgrounds carry colour too, so
  it is brighter and more faithful. Use when nothing draws on top.
- `MIX` / `ROWS` / `COLS`: alternate `SAMPLE` and `GLYPHS` per cell by
  checkerboard, row, or column.


### Canvas: grid, resize, input

- **Arbitrary placement is supported.** `WebCanvasHost` computes mouse
  coordinates relative to the element's bounding rectangle, so the canvas works
  anywhere on a page, including embedded inside a scrolling document. For a
  page-style app, size the element with CSS to fill the viewport:
  `position: fixed; inset: 0; width/height: 100svw/100svh;` plus
  `touch-action: none; user-select: none;`.
- **Grid size** follows the host: `canvas.rows` and `canvas.cols` are derived
  from its size and device pixel ratio, rows capped at 256 and columns at 1024.
  Cells stretch to fill the element, so their exact size is usually fractional.
- **`Canvas` is an `EventTarget`.** `"resize"` fires only when the cell counts
  change; a pixel-only resize still updates cell sizes and the GL viewport
  without firing. `"wheel"` is a `CustomEvent` whose `detail.rows` is already in
  whole rows; trackpad deltas accumulate until they cross a cell height, so
  scrolling stays smooth.
  `"keydown"` / `"keyup"` carry a `Key` detail and fire before the
  built-in key scrolling; call `detail.prevent_default()` to suppress both the
  native action and that scrolling.
- **Input state, in cell units**: `mouse_row/col` (`undefined` while the pointer
  is off-canvas; guard before arithmetic), `mouse_down`, `mouse_down_row/col`
  (press origin; hit-test clicks against this so a drag that leaves the rect
  still counts), `mouse_click` (true for one frame after release; components
  consume it, the app resets it at end of frame), `mouse_owner` (a drag claims
  this string; other components yield while it is set), `class_name` (components
  set a cursor class here; the app syncs it to `document.body`). Keyboard
  scrolling (j/k/arrows, `0` = jump to top) is built in and emits the same
  `"wheel"` events; repeats follow the platform's native key repeat events. It
  engages only while the pointer is over the canvas or the canvas has DOM focus
  (`WebCanvasHost` adds `tabindex=0` unless the app set its own), it never fires
  while focus is in a text input, and it stops when the pointer leaves or focus
  moves away. Pointer state resets on resize; window blur cancels the press and
  click.

## Testing headlessly

tscon tests run under Bun without a browser:

```sh
bun test
bun test src/canvas.test.ts
bun run typecheck
bun run lint
bun run build
```

`TestCanvasHost` supplies virtual CSS/device size, focus, and normalized input
events. `createHeadlessGL2()` supplies a WebGL2-shaped no-op context. The real
`Canvas`, `Terminal`, and `Renderer` run against both, so tests exercise
production code instead of a fake terminal:

```ts
import { describe, expect, test } from "bun:test";
import {
    Canvas,
    TestCanvasHost,
    Terminal,
    createHeadlessGL2,
} from "@micahdb/tscon";

const host = new TestCanvasHost({ css_width: 800, css_height: 480 });
const canvas = new Canvas(host, createHeadlessGL2());
const terminal = new Terminal(canvas);

const wheel: number[] = [];
canvas.addEventListener("wheel", (event) => {
    wheel.push((event as CustomEvent<{ rows: number }>).detail.rows);
});

describe("input", () => {
    test("keyboard scrolling emits wheel rows", () => {
        host.focus();
        host.keyDown("j");

        expect(wheel).toEqual([1]);
    });

    test("pointer positions land on cells", () => {
        host.pointerAtCell(2, 3, canvas.rows, canvas.cols);

        expect(canvas.mouseAt(2, 3, 1, 1)).toBe(true);
    });
});
```

Inject exact situations with `resize`, `focus` / `blur`, `pointerMove`,
`pointerAtCell`, `pointerDown`, `pointerUp`, `pointerCancel`,
`pointerLeave`, `wheel`, `keyDown`, and `keyUp`. `TestCanvasHost.default_prevented`
reports whether the last key event called `prevent_default`.

The headless context is intentionally a no-op. Assert on `Canvas` state,
emitted events, and compiled `Glyphs`; use a real browser for visual output.
Call `canvas.dispose()` when a test is done with its host.

## Recipe 1: bootstrap and frame loop

1. **HTML/CSS.** Place and size the canvas with CSS. For a page-style app make
   it fill the viewport (CSS above); an embedded canvas inside a larger page
   works too. If content must survive without WebGL2, pre-render the same text to
   a `<pre>` fallback at build time and hide it once a WebGL2 context is
   acquired (this is what the author's site micahdb.com does). Done when: the
   canvas fills its intended area and `Canvas.from(el)` does not throw.
2. **Construct once:** `Canvas.from(el)`, `new Terminal(canvas)`,
   `new Renderer(canvas)`. Done when: all three construct (they throw on missing
   WebGL2 or shader errors). Use `new Canvas(host, gl)` only when supplying a
   custom host or context.
3. **Frame loop, in this exact order.** Ordering is what makes compositing work:

```ts
import { Canvas, Glyphs, Renderer, Terminal } from "@micahdb/tscon";

const canvas = Canvas.from(document.querySelector("canvas")!);
const terminal = new Terminal(canvas);
const renderer = new Renderer(canvas);

let resized = false;
canvas.addEventListener("resize", () => { resized = true; });

let content = new Glyphs(CONTENT, contentCols());

const draw = () => {
  if (canvas.rows < 8 || canvas.cols < 16) {      // too-small guard
    canvas.clear(); terminal.clear(); terminal.draw();
    requestAnimationFrame(draw); return;
  }
  if (resized) { // rebuild width-dependent state
    resized = false;
    content = new Glyphs(CONTENT, contentCols());
  }

  canvas.clear(); // clears to palette black, resets class_name
  // ... render offscreen scenes, renderer.draw(...) backgrounds (Recipe 4) ...
  terminal.clear(); // starts a fresh frame, resized to the canvas
  // ... update components, terminal.blit(...) back-to-front ...
  terminal.draw(); // present text over the background
  // ... any renderer.draw(...) meant to paint OVER text ...

  canvas.mouse_click = false; // consume the one-frame flag
  if (document.body.className !== canvas.class_name) {
    document.body.className = canvas.class_name;
  }
  requestAnimationFrame(draw);
};
requestAnimationFrame(draw);
```

   Done when: one frame renders text over the background with blank cells
   transparent, hover feedback works, and narrowing the window re-wraps text
   cleanly.
4. **Resize** is the flag pattern above: the event only sets `resized`; the
   frame loop rebuilds everything width-dependent (compiled text,
   `textureGlyphs` grids, projection matrices). Done when: no rebuild logic
   lives in the event handler itself.

## Recipe 2: content and anchor components

1. **Author content** as text with escapes. Link convention:
   `\a0{Text|URL}Visible_Text`; the anchor sits immediately before visible text
   of the same length, and link text uses underscores instead of spaces so word
   wrap (which breaks at spaces) keeps it on one line, because the component
   overlays exactly `text.length` cells. Done when:
   `new Glyphs(content, cols).anchors[0]?.length` equals your link count.
2. **Compile per width**:
   `content = new Glyphs(str, Math.min(80, canvas.cols - padding))` at
   boot and inside the resize branch only. Done when: the per-frame path
   contains no `new Glyphs` call for static content.
3. **Build components once, position them per frame.** Construct component
   objects from the initial anchors (options parsing is your convention), then
   each frame re-read positions from the *current* `content.anchors[group][i]`
   matched by index. Indices survive recompilation at new widths; rows do not:

```ts
// once:
const links = (content.anchors[0] ?? []).map((a) => {
  const [text = "", url = text] = (a.options ?? "").split("|");
  return new Link(terminal, text, url);
});

// every frame:
const anchors = content.anchors[0] ?? [];
for (const [i, link] of links.entries()) {
  const a = anchors[i]; if (!a) break;
  const row = a.row - scrollRow, col = a.col + PADDING_COLS;
  if (row < 0 || row >= canvas.rows) continue;      // scrolled off-screen
  const g = link.update(row, col);
  terminal.blit(g, { row: 0, col: 0, rows: 1, cols: g.cols },
                   { row, col, rows: 1, cols: g.cols });
}
```

   Done when: after a resize, hover and click still land on the right rows.
4. **Component contract.** `update(row, col)`: hit-test hover with
   `canvas.mouseAt`, activation with
   `canvas.mouseDownAt(...) && canvas.mouse_click`; on hover set
   `canvas.class_name = "pointer"` and `terminal.detail_text` (a status line the
   Terminal draws across the bottom row; reserve your own status row above it
   when detail text may be present, and set both every frame since `clear()`
   resets them); return cached one-row `Glyphs`, recompiling only when visual
   state changed:

```ts
import { Glyphs, Terminal, Wrap } from "@micahdb/tscon";

class Link {
  private hovered: boolean | null = null;   // null forces the first compile
  private glyphs: Glyphs | null = null;
  private readonly terminal: Terminal;
  private readonly text: string;
  private readonly url: string;

  constructor(terminal: Terminal, text: string, url: string) {
    this.terminal = terminal;
    this.text = text;
    this.url = url;
  }

  update(row: number, col: number): Glyphs {
    const c = this.terminal.canvas;
    const hot = c.mouseAt(row, col, 1, this.text.length);
    if (hot && c.mouseDownAt(row, col, 1, this.text.length) && c.mouse_click) {
      window.open(this.url, "_blank");
    } else if (hot) {
      c.class_name = "pointer";
      this.terminal.detail_text = ` Link: ${this.url} `;
    }
    if (this.glyphs === null || hot !== this.hovered) {
      this.hovered = hot;
      this.glyphs = new Glyphs(
        hot ? `\\f0\\F4${this.text}` : `\\F4\\b0${this.text}`,
        this.text.length, { wrap: Wrap.TRUNCATE });
    }
    return this.glyphs;
  }
}
```

   Done when: glyph recompilation happens on state transitions only (verify by
   counting `new Glyphs` calls).

5. **Inline textures** use the same bridge: an anchor in the text marks where
   the region starts, the grid it was compiled into gives the cell, and a
   `textureGlyphs` grid of the same size is drawn with `renderer.draw` under the
   text. Give the anchor's line as many blank rows beneath it as the region is
   tall so the surrounding text does not collide with it.

```ts
// the document holds \a2{portrait|6|12} on a line with five blank rows below
const anchor = content.anchors[2]?.[0];
const [name = "", rows = "1", cols = "1"] = (anchor?.options ?? "").split("|");
const grid = textureGlyphs(Number(rows), Number(cols), TexGlyphMode.SAMPLE);

renderer.draw(grid, textures.get(name)!, {
  row: anchor!.row - scrollRow,
  col: anchor!.col,
  rows: grid.rows,
  cols: grid.cols,
});
```

   Done when: the texture lands on the anchor's cell and scrolls with the text.

## Recipe 3: scrolling

Implement a pager: accumulate wheel rows, claim `mouse_owner` for drags, carry a
float offset with fling inertia, clamp, expose an integer row; blit the visible
slice of content. `blit`'s clipping handles overhang, so only the slice math is
yours:

```ts
let wheelRows = 0;
canvas.addEventListener("wheel", (e) => {
  wheelRows += (e as CustomEvent<{ rows: number }>).detail.rows;
});

let rowOffset = 0, velocity = 0;
let drag: { startRow: number; lastRow: number; offset: number } | null = null;

function updateScroll(contentRows: number): number {
  const max = Math.max(0, contentRows - canvas.rows);
  if (wheelRows !== 0) {
    if (!canvas.mouse_down) rowOffset += wheelRows;  // wheel ignored mid-drag
    wheelRows = 0; velocity = 0;                     // wheel cancels fling
  }

  if (canvas.mouse_down && canvas.mouse_row !== undefined) {
    if (canvas.mouse_owner === "") {
      canvas.mouse_owner = "pager";
      drag = { startRow: canvas.mouse_row, lastRow: canvas.mouse_row,
               offset: Math.round(rowOffset) };
    }
    if (canvas.mouse_owner === "pager" && drag) {
      velocity = Math.max(-2, Math.min(2, canvas.mouse_row - drag.lastRow));
      drag.lastRow = canvas.mouse_row;
      rowOffset = drag.offset - (canvas.mouse_row - drag.startRow);
    }
  } else {
    if (canvas.mouse_owner === "pager") {
      canvas.mouse_owner = ""; drag = null;
    }
    rowOffset -= velocity; velocity *= 0.95;
    if (Math.abs(velocity) < 0.01) velocity = 0;
  }
  rowOffset = Math.max(0, Math.min(max, rowOffset));
  return Math.round(rowOffset);
}
```

Done when: wheel, drag-with-fling, and the built-in j/k keys all scroll, and a
drag claimed by another component (`mouse_owner !== ""`) is not hijacked.

## Recipe 4: 3D or textured background

Render your scene into an offscreen texture, then composite it with `Renderer`
*before* `terminal.draw()`.

1. **Own a render target** (once): a fixed-size RGBA texture, a depth
   renderbuffer, and a framebuffer binding them. Done when:
   `checkFramebufferStatus` is complete.
2. **Respect the GL state boundary.** tscon's draw methods set up their own
   program, buffers, textures, and uniforms every call, but they assume the
   default framebuffer, a full-canvas viewport, and `DEPTH_TEST` off. Restore
   all three after your scene pass:

```ts
gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
gl.viewport(0, 0, 1024, 1024);
gl.enable(gl.DEPTH_TEST);
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
// ... draw the scene with compileProgram / Mat4 ...
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.viewport(0, 0, canvas.width, canvas.height);
gl.disable(gl.DEPTH_TEST);
```

   Done when: the scene renders into the texture and the terminal still draws
   correctly afterwards (state leaks surface as blank or wrongly-sized output).
3. **Aspect-correct for cells**: perspective or orthographic aspect =
   `(0.5 * cols) / rows`, because cells are twice as tall as wide; a raw
   cell-count aspect double-stretches. Recompute on resize.
4. **Composite:** build
   `textureGlyphs(canvas.rows, canvas.cols, TexGlyphMode.GLYPHS)` (rebuild on
   resize) and call `renderer.draw` with `dst` =
   `{ row: 0, col: 0, rows: tglyphs.rows, cols: tglyphs.cols }` before
   `terminal.draw()`. Choose `GLYPHS` under text, `BG_GLYPHS` for fullscreen
   demos, `SAMPLE` for images that must stay photographic. Done when: the
   background appears as coloured characters and text floats over it.

## Explaining tscon to a human

One paragraph, if asked why it is built this way: tscon treats the browser
canvas as a 1980s text-mode display, a fixed grid of character cells, while
keeping the web's compositing model. Text *is* the content model -- styling and
interactivity markers are inline escapes -- and a compiled grid is both what you
draw and the map from source characters to screen cells, so cursors, clicks,
selection, and highlights all resolve against the same object that renders.
Textures and live 3D renders land in the same grid, either photographically or
converted into coloured characters. Interactivity is faked honestly: anchors in
the text mark positions, and small components re-render one row of characters
and hit-test cell rectangles each frame, which is how a character grid ends up
with links, scrolling, and hover effects that feel like a web page.

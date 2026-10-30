# @micahdb/tscon

WebGL 2.0 text-mode graphics in TypeScript.

tscon draws a `<canvas>` as a grid of character cells. Text is written once,
compiled into that grid, and drawn with a single GPU call, so a web page can
be laid out, styled, and interacted with as plain characters. It also renders
live textures as characters, which makes photographic and 3D content sit
inside the same grid.

## Install

```sh
bun add @micahdb/tscon
# or
npm install @micahdb/tscon
```

## Usage

```ts
import { Canvas, Glyphs, Terminal } from "@micahdb/tscon";

const canvas = Canvas.from(document.querySelector("canvas")!);
const terminal = new Terminal(canvas);

// compile the text once, at the width you want it to fill
const glyphs = new Glyphs("Hello, tscon!", canvas.cols);

// draw: clear the frame, blit the grid, present it
canvas.clear();
terminal.clear();
terminal.blit(
    glyphs,
    { row: 0, col: 0, rows: glyphs.rows, cols: glyphs.cols },
    { row: 0, col: 0, rows: glyphs.rows, cols: glyphs.cols },
);
terminal.draw();
```

Everything is measured in cells, never pixels: `canvas.rows` by `canvas.cols`
cells, roughly 8x16 CSS pixels each. Sizes come from the canvas, and regions
are `{ row, col, rows, cols }`.

## Text

Text is a plain string with escape sequences for styling and for marking
positions:

| Escape | Meaning |
| --- | --- |
| `\fX` / `\FX` | foreground, dark / bright palette index `X` |
| `\bX` / `\BX` | background, dark / bright palette index `X` |
| `\aX` / `\aX{options}` | an anchor in group `X` (0-9), with optional payload |
| `\\` | a literal backslash |

A newline starts a new line, `\` before a newline joins two lines, and a tab
advances to the next multiple of `TAB_WIDTH`. Raw mode
(`new Glyphs(text, cols, { raw: true })`) renders escapes literally; tabs still
advance to their next tab stop.

`Glyphs` compiles text for a given width. The grid it produces can be blitted
directly, and can also answer where things ended up:

```ts
import { Glyphs, Wrap } from "@micahdb/tscon";

const g = new Glyphs("Click \\a0{here|#}here", 40);

g.renderedCell(17);     // { row: 0, col: 6 }: where the "h" draws
g.renderedCell(6);      // null: index 6 is inside the anchor
g.cursorCell(6);        // { row: 0, col: 6 }: a cursor here shows on the "h"
g.cursorIndex(0, 9);    // 20: the source character under that cell
g.spansFor(17, 21);     // [{ row: 0, from: 6, to: 10 }]
g.rowCols(0);           // 10: "Click here"

const hard = new Glyphs("long text", 4, { wrap: Wrap.HARD });
hard.wrappedText;       // ["long", " tex", "t"]
```

`col` indices are positions in the source string, escapes included; `row` and
`col` from the position methods are cells in the compiled grid.

## Anchors

An anchor marks a cell for the application without occupying space of its
own. `glyphs.anchors[group]` lists them, each with the payload and the cell of
the character that follows it. What a group means is up to you: links,
inline images, headings, hit targets.

```ts
const g = new Glyphs("\\a0{Docs|#docs}Docs", 20);
const link = g.anchors[0]![0]!;
// { options: "Docs|#docs", row: 0, col: 0, index: 15 }
```

## Textures

`Renderer` draws a texture into a region as cells, either as the texture
itself or converted into coloured characters:

```ts
import { Renderer, TexGlyphMode, textureGlyphs } from "@micahdb/tscon";

const renderer = new Renderer(canvas);
const grid = textureGlyphs(24, 48, TexGlyphMode.BG_GLYPHS);

renderer.draw(grid, someWebGLTexture, { row: 0, col: 0, rows: 24, cols: 48 });
```

Textures composite under text: blank cells are transparent, so text stays
readable over a rendered scene.

## Escape hatch

`Glyphs.mapCells` derives an altered copy of a compiled grid -- a cursor
inversion, a selection shade, a cleared region -- without touching the
original or losing its positions:

```ts
// blank a strip, so whatever is drawn beneath it shows through
const cleared = glyphs.mapCells(
    () => 0,
    { row: 2, col: 0, rows: 1, cols: 10 },
);
```

## Palette

The terminal uses a 16-colour palette made of 8-bit `[R, G, B]` triples.
`DEFAULT_COLOURS` is the default, ordered by `Colour`. Pass a partial or complete
palette when constructing a canvas, or replace it at runtime:

```ts
import { Canvas, Colour, DEFAULT_COLOURS, Palette } from "@micahdb/tscon";

const palette = new Palette(DEFAULT_COLOURS);
palette.colours[Colour.RED] = [0xff, 0x00, 0x00];

const canvas = Canvas.from(element, { palette });

// replace it later; missing entries fall back to the default colours
canvas.setPalette(new Palette([
    [0x08, 0x08, 0x08],
    [0xff, 0x00, 0x00],
]));
```

Channels outside `0`-`255` are clamped and rounded. `Terminal` and `Renderer`
apply the canvas's current palette on every draw, so changes take effect on
the next frame.

## Hosts

`Canvas` reads size and input from a `CanvasHost` and draws through an
injected WebGL2 context. `Canvas.from(element)` creates the normal browser
host and context for you:

```ts
import { Canvas } from "@micahdb/tscon";

const canvas = Canvas.from(document.querySelector("canvas")!);
```

It throws when a WebGL2 context cannot be acquired.

Use the constructor when you need to supply the host or context yourself:

```ts
import { Canvas, WebCanvasHost } from "@micahdb/tscon";

const host = new WebCanvasHost(canvasElement);
const gl = canvasElement.getContext("webgl2")!;
const canvas = new Canvas(host, gl);
```

`WebCanvasHost` owns the element's DPR sizing, focus, pointer capture, and
native listener wiring. `Canvas` itself owns the cell grid, WebGL resources,
input state, and events. Keyboard events are dispatched before the built-in
key scrolling; call `event.detail.prevent_default()` to suppress both the
browser default and that scrolling. Call `canvas.dispose()` to remove host
listeners.

## Testing

tscon tests run headlessly with Bun. `TestCanvasHost` supplies virtual DOM
size, focus, pointer, wheel, keyboard, and resize events, while
`createHeadlessGL2()` supplies a WebGL2-shaped no-op context. The real
`Canvas`, `Terminal`, and `Renderer` can therefore be constructed and used
without a browser or GPU:

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

describe("canvas input", () => {
    test("j emits one wheel row when focused", () => {
        host.focus();
        host.keyDown("j");

        expect(wheel).toEqual([1]);
    });

    test("pointer positions land on cells", () => {
        host.pointerAtCell(2, 3, canvas.rows, canvas.cols);

        expect(canvas.mouseAt(2, 3, 1, 1)).toBe(true);
    });

    test("press and release produces a click", () => {
        host.pointerMove(40, 80);
        host.pointerDown(40, 80);
        host.pointerUp(40, 80);

        expect(canvas.mouse_click).toBe(true);
    });
});
```

Inject exact situations through the test host:

- `resize(cssWidth, cssHeight, dpr?)`
- `focus()` / `blur()`
- `pointerMove`, `pointerAtCell`, `pointerDown`, `pointerUp`,
  `pointerCancel`, `pointerLeave`
- `wheel(deltaY, deltaMode?)`
- `keyDown` / `keyUp`

`TestCanvasHost.default_prevented` reports whether the last key event called
`prevent_default`. The headless context is intentionally a no-op: tests should
assert on `Canvas` state, emitted events, and compiled `Glyphs`, not on GPU
pixels. Use a real browser for visual checks.

Run the checks in this order:

```sh
bun test                 # the whole suite
bun test src/canvas.test.ts
bun test src/glyphs.test.ts
bun run typecheck
bun run lint
bun run build
```

## Development

This project uses [Bun](https://bun.sh) as its primary toolchain (installs,
scripts, and publishing) with the TypeScript compiler for type-checking and
`dist/` emission.

```sh
bun install        # install dev dependencies
bun run shaders    # regenerate src/shaders.ts from shaders/
bun test           # run the test suite
bun run typecheck  # type-check only
bun run lint       # lint
bun run build      # type-check + emit dist/ (JS + .d.ts)
```

Source files import each other with explicit `.ts` extensions so they run
natively under Bun; the build rewrites those specifiers to `.js` in the
published output via `rewriteRelativeImportExtensions`.

## License

MIT

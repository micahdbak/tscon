---
name: tscon-know-how
description: >-
  Build and debug apps using @micahdb/tscon. Covers cell layout, interactive
  text, WebGL2 compositing and fonts, and headless tests.
---

# Using @micahdb/tscon

Import the package as a namespace and use the `tscon` prefix in code:

```ts
import * as tscon from "@micahdb/tscon";

const canvas = tscon.Canvas.from(element);
const terminal = new tscon.Terminal(canvas);
```

Read the installed declarations in `node_modules/@micahdb/tscon/dist/` for
signatures and the README for setup. The grid is the shared coordinate system
for text, textures, and input. Use integer cell rectangles (`tscon.Rect`) for
layout and hit testing.

## Canvas and frame lifecycle

Size the canvas element with CSS, then construct it with
`tscon.Canvas.from(element)`. That method accepts `tscon.CanvasOptions` for the
initial palette and cell stretching. The default grid starts at the top left and
uses integer multiples of 8x16 device pixels per cell. Remaining pixels on the
right and bottom show the canvas background and are outside the input grid. Use
`{ stretch: true }` to fill the canvas with potentially fractional cell sizes. A
canvas smaller than one 8x16 cell uses the full-canvas grid.

Read `canvas.rows` and `canvas.cols` for layout. Compile static `tscon.Glyphs`
when their source or available width changes. Cache `tscon.textureGlyphs` by
size and mode. The canvas's `"resize"` event fires when the cell counts change.
A resize that keeps the same counts still updates the viewport and actual cell
dimensions.

For each frame:

1. Call `canvas.clear()` to clear to the theme background and reset
   `class_name`.
2. Composite background textures with `tscon.Renderer.draw`.
3. Call `terminal.clear()` to reset the cell buffer and `detail_text`. Blit
   content and overlays in paint order, then call `terminal.draw()`.
4. Apply any cursor class and reset `canvas.mouse_click` after components have
   processed it.

`terminal.blit` requires matching source and destination sizes and clips at the
canvas edges. Later blits overwrite earlier cells in the terminal buffer. The
terminal draw skips zero-valued cells, revealing anything drawn beneath it. Use
untouched cells or `mapCells(() => 0, rect)` for transparent regions. A literal
space in the default colours paints the background.

## Text and interaction

Use `tscon.Glyphs` for rendering and source-to-cell mapping. Use
`tscon.textToLines` when only the wrapped strings are needed. `tscon.layoutText`
returns a `tscon.TextLayout` when you need row starts and source offsets. Use
`tscon.hasEscape` and `tscon.scanEscapeAt` when parsing the same format for
another output, such as an HTML fallback. `tscon.scanEscapeAt` returns a
`tscon.EscapeScan`.

Word wrapping fits prose, hard wrapping fits editor buffers, and truncation fits
single-row UI. Use `tscon.Wrap.WORD`, `tscon.Wrap.HARD`, or
`tscon.Wrap.TRUNCATE`; `tscon.TextOptions` controls wrapping and raw mode. Pass
`{ raw: true }` to display escape syntax literally. Tabs advance to the next
`tscon.TAB_WIDTH` stop.

Unstyled text uses palette entries 16 and 17 for its foreground and background.
Use `\c` to restore both. Numeric colour escapes change one channel at a time.
Use `tscon.packCell` and `tscon.unpackCell` when transforming the 32-bit cells.
`tscon.unpackCell` returns a `tscon.CellAttributes`. `tscon.CP437_CHARS` maps
CP437 codes to characters, and `tscon.charCodeInCp437` maps a Unicode code point
to a CP437 index.

In `\a0{options}text`, the anchor has no closing escape, occupies zero columns,
and leaves the trailing `text` as visible cells. Each entry in
`glyphs.anchors[0]` is a `tscon.Anchor` with `row`, `col`, and `index` for the
following character, plus `start` and `end` for the escape's source range. The
payload is application data, and its closing brace must be on the same line.
Adjacent anchors can share `index`; use `start` and `end` when their source
order matters. After reflow, read positions from the new `tscon.Glyphs`
instance.

For wrapped links and selection, resolve a source range with
`glyphs.spansFor(start, end)`. It returns `tscon.Spans`, a selection over that
grid. Use `contains` for hit testing relative to the grid, `equals` to compare
run geometry, and `mapCells` to restyle only the selected cells. Use
`blit(terminal, origin, clip)` to draw the runs at a translated origin with an
optional destination clip. Cache decorated `tscon.Spans` until the grid, range,
or visual state changes. Use `renderedCell` to locate a character's cell,
`cursorCell` to place the caret on indices such as escapes and tabs, and
`cursorIndex` to map a hit back to source text.

Check hover with `canvas.mouseAt`. For click activation, combine
`canvas.mouse_click` with the current pointer and press-origin hit tests as
appropriate. `mouseDownAt` checks where the press began. Claim `mouse_owner`
during a drag and release it when the gesture ends. `tscon.WebCanvasHost` backs
a browser canvas; `tscon.CanvasHost` and `tscon.CanvasHostEventMap` define the
host surface.

Consume `"wheel"` events as signed whole-row deltas and clamp the scroll offset
to the document. Built-in keyboard scrolling emits the same event when the
canvas is focused or hovered. To handle a scrolling key yourself, call
`event.detail.prevent_default()` in the canvas's `"keydown"` listener.
`tscon.Key` and `tscon.WheelMode` describe those input values.

## Textures and font atlases

A `tscon.textureGlyphs` grid must match the full destination rectangle. When an
image scrolls partly offscreen, pass the whole grid with its translated
destination. Clipping then preserves the mapping from each visible cell to the
source texture. `tscon.textureGlyphs` returns a `tscon.TexGlyphs`. Use
`tscon.TexGlyphMode.SAMPLE` for the original image, `GLYPHS` for coloured
characters on the theme background, and `BG_GLYPHS` for coloured foregrounds and
backgrounds.

`tscon.loadTexture` loads an image into a mipmapped texture. `tscon.loadCubeMap`
loads six images into a cube-map texture for custom shader pipelines.

When drawing an offscreen WebGL2 pass, save the viewport before changing it.
Restore that viewport, the framebuffer binding, and any other GL state the pass
changed before drawing the terminal or texture grid. The viewport dimensions can
differ from `canvas.width` and `canvas.height`. For a scene drawn into a cell
region, compute its projection aspect from
`(cols * canvas.actual_cell_width) / (rows * canvas.actual_cell_height)`.

Modern DOS is the built-in CP437 bitmap font and uses nearest-neighbour
sampling. An optional custom font uses a 32x8 atlas with red-channel coverage.
Use `tscon.renderCp437` to paint a CSS font into a 2D canvas and upload the
result as a WebGL texture. Set `canvas.user_font` and enable `use_user_font` on
each `tscon.Terminal` or `tscon.Renderer` that should use it. Custom glyphs are
anti-aliased within their own atlas cells. Codes 176 through 223 use the
built-in font for connected strokes, shades, and blocks. A null atlas falls back
to Modern DOS, so the texture can be assigned once an asynchronous load
completes.

## Colours and cell data

`tscon.Palette` holds `tscon.Rgb` triples indexed by `tscon.Colour`. Missing
entries use `tscon.DEFAULT_COLOURS`. Pass a palette in `tscon.CanvasOptions` or
call `canvas.setPalette`.

## Math and GL helpers

Use `tscon.Mat4` and `tscon.Vec4` for custom rendering transforms.
`tscon.compileProgram`, `tscon.getAttribLocations`, and
`tscon.getUniformLocations` build and inspect WebGL2 programs.

```ts
const projection = tscon.Mat4.create();
tscon.Mat4.perspective(projection, Math.PI / 3, 16 / 9, 0.1, 100);

const point = tscon.Vec4.from(1, 2, 3, 1);
tscon.Vec4.transformMat4(point, point, tscon.Mat4.translation(1, 0, 0));
```

## Testing

Use a real `tscon.Canvas`, `tscon.Terminal`, and `tscon.Renderer` with
`tscon.TestCanvasHost` and `tscon.createHeadlessGL2()` for tests of input,
layout, and draw calls. The headless context records no pixels. Use WebGL2 in a
browser for shader checks and pixel readback.

```ts
const host = new tscon.TestCanvasHost({ css_width: 800, css_height: 480 });
const canvas = new tscon.Canvas(host, tscon.createHeadlessGL2());
```

`tscon.HeadlessGL2` is the class behind `createHeadlessGL2()`.

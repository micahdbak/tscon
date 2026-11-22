---
name: tscon-know-how
description: >-
  Build and debug apps using @micahdb/tscon. Covers cell layout, interactive
  text, WebGL2 compositing and fonts, and headless tests.
---

# Using @micahdb/tscon

Use the package root for imports. Read the installed declarations in
`node_modules/@micahdb/tscon/dist/` for signatures and the README for basic
setup. The grid is the shared coordinate system for text, textures, and input.
Use integer cell rectangles for layout and hit testing.

## Canvas and frame lifecycle

Size the canvas element with CSS and construct it with `Canvas.from(element)`.
The default grid starts at the top left and uses integer multiples of 8x16
device pixels per cell. Remaining pixels on the right and bottom show the canvas
background and are outside the input grid. Use `{ stretch: true }` to fill the
canvas with potentially fractional cell sizes. A canvas smaller than one 8x16
cell uses the full-canvas grid.

Read `canvas.rows` and `canvas.cols` for layout. Compile static `Glyphs` when
their source or available width changes. Cache `textureGlyphs` by size and mode.
The canvas's `"resize"` event fires when the cell counts change. A resize that
keeps the same counts still updates the viewport and actual cell dimensions.

For each frame:

1. Call `canvas.clear()` to clear to the theme background and reset
   `class_name`.
2. Composite background textures with `Renderer.draw`.
3. Call `terminal.clear()` to reset the cell buffer and `detail_text`. Blit
   content and overlays in paint order, then call `terminal.draw()`.
4. Apply any cursor class and reset `canvas.mouse_click` after components have
   processed it.

`Terminal.blit` requires matching source and destination sizes and clips at the
canvas edges. Later blits overwrite earlier cells in the terminal buffer. The
terminal draw skips zero-valued cells, revealing anything drawn beneath it. Use
untouched cells or `mapCells(() => 0, rect)` for transparent regions. A literal
space in the default colours paints the background.

## Text and interaction

Use `Glyphs` for rendering and source-to-cell mapping. Use `textToLines` when
only the wrapped strings are needed. Use `scanEscapeAt` when parsing the same
format for another output, such as an HTML fallback. Word wrapping fits prose,
hard wrapping fits editor buffers, and truncation fits single-row UI. Pass
`{ raw: true }` to display escape syntax literally.

Unstyled text uses palette entries 16 and 17 for its foreground and background.
Use `\c` to restore both. Numeric colour escapes change one channel at a time.
Use `packCell` and `unpackCell` when transforming the 32-bit cells.

In `\a0{Docs|#docs}Docs`, the anchor occupies zero columns and the trailing
`Docs` supplies the visible cells. Each entry in `glyphs.anchors[0]` carries the
position and source index of the following character. The payload is application
data, and its closing brace must be on the same line. After reflow, read
positions from the new `Glyphs` instance.

For wrapped links and selection, convert the source range to row runs with
`spansFor(start, end)` and translate those runs by the view's origin and scroll
offset. Use `renderedCell` to locate a character's cell, `cursorCell` to place
the caret on indices such as escapes and tabs, and `cursorIndex` to map a hit
back to source text. Cache restyled glyphs until their content or visual state
changes.

Check hover with `canvas.mouseAt`. For click activation, combine
`canvas.mouse_click` with the current pointer and press-origin hit tests as
appropriate. `mouseDownAt` checks where the press began. Claim `mouse_owner`
during a drag and release it when the gesture ends.

Consume `"wheel"` events as signed whole-row deltas and clamp the scroll offset
to the document. Built-in keyboard scrolling emits the same event when the
canvas is focused or hovered. To handle a scrolling key yourself, call
`event.detail.prevent_default()` in the canvas's `"keydown"` listener.

## Textures and font atlases

A `textureGlyphs` grid must match the full destination rectangle. When an image
scrolls partly offscreen, pass the whole grid with its translated destination.
Clipping then preserves the mapping from each visible cell to the source
texture. Use `SAMPLE` for the original image, `GLYPHS` for coloured characters
on black, and `BG_GLYPHS` for coloured foregrounds and backgrounds.

When drawing an offscreen WebGL2 pass, save the viewport before changing it.
Restore that viewport, the framebuffer binding, and any other GL state the pass
changed before drawing the terminal or texture grid. In particular, the saved
viewport can be smaller than `canvas.width` by `canvas.height`. For a scene
drawn into a cell region, compute its projection aspect from
`(cols * canvas.actual_cell_width) / (rows * canvas.actual_cell_height)`.

Modern DOS is the built-in CP437 bitmap font and uses nearest-neighbour
sampling. An optional custom font uses a 32x8 atlas with red-channel coverage.
Use `renderCp437` to paint a CSS font into a 2D canvas and upload the result as
a WebGL texture. Set `canvas.user_font` and enable `use_user_font` on each
`Terminal` or `Renderer` that should use it. Custom glyphs are anti-aliased
within their own atlas cells. Codes 176 through 223 use the built-in font for
connected strokes, shades, and blocks. A null atlas falls back to Modern DOS, so
the texture can be assigned once an asynchronous load completes.

## Testing

Use a real `Canvas`, `Terminal`, and `Renderer` with `TestCanvasHost` and
`createHeadlessGL2()` for tests of input, layout, and draw calls. The headless
context records no pixels. Use WebGL2 in a browser for shader checks and pixel
readback.

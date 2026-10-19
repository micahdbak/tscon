# @micahdb/tscon

WebGL 2.0 text-mode graphics in TypeScript.

## Install

```sh
bun add @micahdb/tscon
# or
npm install @micahdb/tscon
```

## Usage

```ts
import { Canvas, Terminal, textGlyphs, type Rect } from "@micahdb/tscon";

const canvas = new Canvas(document.querySelector("canvas")!);
const terminal = new Terminal(canvas);

const region: Rect = { row: 0, col: 0, rows: canvas.rows, cols: canvas.cols };
terminal.clear();
terminal.blit(textGlyphs("Hello, tscon!"), region);
terminal.draw();
```

## Development

This project uses [Bun](https://bun.sh) as its primary toolchain
(installs, scripts, and publishing) with the TypeScript compiler for
type-checking and `dist/` emission.

```sh
bun install        # install dev dependencies
bun run shaders    # regenerate src/shaders.ts from shaders/
bun run build      # type-check + emit dist/ (JS + .d.ts)
```

Source files import each other with explicit `.ts` extensions so they run
natively under Bun; the build rewrites those specifiers to `.js` in the
published output via `rewriteRelativeImportExtensions`.

## License

MIT

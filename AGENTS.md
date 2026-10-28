# AGENTS.md

Guidance for coding agents working in this repository.

## What this is

`@micahdb/tscon`: a TypeScript library rendering a browser canvas as a
text-mode terminal on WebGL2. Text compiles to packed 16-bit glyph cells;
the CPU packs bytes and the GPU rasterizes everything in one instanced
draw. Bun builds and tests it; TypeScript checks it; oxlint lints it.
Scripts live in `package.json`.

## Never publish

An agent must never attempt to publish the package: no `npm publish`, no
`bun publish`, no `npm pack`/version-bump-and-tag flows, no registry
logins. `prepack` runs the build automatically, so any pack/publish
command triggers it silently. Releasing is the human's manual act; make
the change, verify it, and stop.

## Code style

**Naming.** `PascalCase` for classes and type names, with
`SCREAMING_SNAKE_CASE` for enum members and module constants. `camelCase`
for functions and methods. `snake_case` for local variables, arguments, and
class fields, including private ones.

**Classes vs functions.** Prefer free functions taking explicit arguments.
A class earns its place when data and methods genuinely belong together and
instantiation makes sense: canvases, terminals, renderers -- objects owning
GPU resources and per-frame state.

**Size and shape.** A function is at least 3 lines of code and at most
about two screens; split past that into named parts. Prefer guard clauses
over nested branches; deep indentation is a sign the function wants
refactoring. Keep the line count as low as the logic allows, and drop
redundant guards the type system or the call sites already guarantee.

**Fields.** Group class fields: `readonly` fields first, then mutables,
with blank lines separating logical groups (GPU resources, per-frame
state). Declare fields in the class body and assign them in the
constructor rather than using parameter properties.

**Imports.** One line each, no blank-line grouping. Order: external
packages, then parent-relative (`../`) paths, then sibling (`./`) paths --
alphabetically within each group. Use `import type` for type-only imports
and merge duplicate imports of the same module.

**Types.** Name object shapes that appear at more than one use site;
inline literals are fine for single-use local shapes.

**Comments.** Not preferred; make code readable through naming and
abstraction first. Add a comment only when it carries information the code
cannot. Multi-line comments are doc comments: `/** */`, capitalized first
word, ` * ` on continuation lines, on classes, methods, and named
functions. Single-line notes use `//`.

**Formatting.** Tab indentation, semicolons, `const` by default. No line
exceeds 100 columns; wrap arguments and hoist named locals to fit. Blank
lines surround every `if`/`for`/`while` block: one before it (before the
comment that introduces it, if any) and one after.

**API docs.** Exported functions, classes, and types are the package's
manual; their doc comments are written for a developer reading the `.d.ts`,
not for the implementer. Each carries:

- a summary line saying what it does, followed by explanation paragraphs
  for anything the signature cannot say (escape sequences interpreted,
  units and coordinate systems, what renders and what clips);
- an `@example` block showing real usage, kept compiling-honest;
- an `@param` entry for every argument -- aligned, with constraints and
  edge-case behaviour called out (`<= 0`, clamping, what happens at end
  of text);
- an `@returns` line describing the return value's shape and meaning;
- `{@link ...}` references to the related APIs it uses or produces.

Private and internal helpers keep short notes only.

**Source is ASCII.** Identifiers, comments, and operators included. Non-ASCII
characters appear only inside test fixtures and displayed-string literals;
write glyphs in tscon escape syntax (`\fX`, `\aX{...}`) rather than
embedding them.

## Verifying work

Run, in order, and leave each clean:

1. `bun test` -- every test passes.
2. `bun run typecheck` -- no errors.
3. `bun run lint` -- no warnings.
4. `bun run build` -- completes.

The line-length and blank-line conventions are not fully lint-enforced;
check them by eye on every file touched.

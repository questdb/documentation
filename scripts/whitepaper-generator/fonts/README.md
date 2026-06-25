# Brand fonts for PDF generation

Drop the QuestDB **desktop** brand font files here. These are consumed by
`fontspec` in the XeLaTeX templates and are shared by **both** PDF pipelines
(`whitepaper-generator` and `pdf-generator`/cookbook), since the cookbook build
already adds `whitepaper-generator/` to its `TEXINPUTS`/`resource-path`.

> **The font files are not committed.** PP Neue Montreal and GT Standard Mono
> are commercial, licensed fonts and must not be redistributed in a public repo,
> so everything in this folder except this README is gitignored. To build the
> PDFs locally you must add the files yourself, with the exact names and folder
> structure below.

## Required format

- **`.otf` or `.ttf` only.** XeLaTeX/`fontspec` **cannot** read `.woff`/`.woff2`
  (those are web-only). If you only have web fonts, convert them first
  (e.g. `fonttools ttLib.woff2 decompress`) or, better, supply the desktop
  originals.
- Use the **static weights** named below — the template references each weight
  by filename, so the names must match exactly.

## Required files and layout

The template (`template.tex`) points `fontspec` at these two subfolders by name,
so the structure must be:

```
fonts/
├── Neue Montreal/
│   ├── PPNeueMontreal-Regular.ttf      # body — required
│   ├── PPNeueMontreal-Medium.ttf       # headings + cover title — required
│   ├── PPNeueMontreal-Bold.ttf         # bold body / table headers — required
│   ├── PPNeueMontreal-Italic.ttf       # italics (body + headings) — required
│   └── PPNeueMontreal-BoldItalic.ttf   # bold italic — required
└── GT Standard Mono/
    ├── GT-Standard-Mono-Standard-Regular.otf   # code blocks — required
    └── GT-Standard-Mono-Standard-Bold.otf      # bold code — required
```

All seven files are referenced by the template; a missing file will break the
XeLaTeX build.

## How the template uses them

The template loads them from `$fontdir$` (passed by `generate-pdf.sh` as
`--variable=fontdir:.../fonts`):

```latex
% Body / main font
\setmainfont{PPNeueMontreal-Regular.ttf}[
  Path           = $fontdir$/Neue Montreal/ ,
  BoldFont       = PPNeueMontreal-Bold.ttf ,
  ItalicFont     = PPNeueMontreal-Italic.ttf ,
  BoldItalicFont = PPNeueMontreal-BoldItalic.ttf ]

% Headings (Medium weight, -1.4% tracking)
\newfontfamily\headingfont{PPNeueMontreal-Medium.ttf}[
  Path       = $fontdir$/Neue Montreal/ ,
  ItalicFont = PPNeueMontreal-Italic.ttf ,
  LetterSpace = -1.4 ]

% Cover title (Medium weight, -3% tracking)
\newfontfamily\covertitlefont{PPNeueMontreal-Medium.ttf}[
  Path = $fontdir$/Neue Montreal/ ,
  LetterSpace = -3.0 ]

% Code / mono
\setmonofont{GT-Standard-Mono-Standard-Regular.otf}[
  Path     = $fontdir$/GT Standard Mono/ ,
  BoldFont = GT-Standard-Mono-Standard-Bold.otf ,
  Scale    = 0.85 ]
```

> Note: these fonts are licensed for desktop/embedding use only. Confirm the
> licence permits **embedding in distributed PDFs** before sharing generated
> output externally, and never commit the font files themselves.

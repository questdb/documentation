# Brand fonts for PDF generation

Drop the QuestDB **desktop** brand font files here. These are consumed by
`fontspec` in the XeLaTeX templates and are shared by **both** PDF pipelines
(`whitepaper-generator` and `pdf-generator`/cookbook), since the cookbook build
already adds `whitepaper-generator/` to its `TEXINPUTS`/`resource-path`.

## Required format

- **`.otf` or `.ttf` only.** XeLaTeX/`fontspec` **cannot** read `.woff`/`.woff2`
  (those are web-only). If you only have web fonts, convert them first
  (e.g. `fonttools ttLib.woff2 decompress`) or, better, supply the desktop
  originals.
- A variable `.ttf` works but **static weights are more reliable** in XeLaTeX.

## Faces to include

| Role | File | Needed |
|------|------|--------|
| Main sans — upright | `*-Regular` | required |
| Main sans — bold | `*-Bold` | required (headings, table headers) |
| Main sans — italic | `*-Italic` | required (blockquotes) |
| Main sans — bold italic | `*-BoldItalic` | recommended |
| Mono — upright | `*-Regular` | required (code blocks) |
| Mono — bold | `*-Bold` | optional |

## Suggested naming

Filenames are referenced by stem in the template, so keep them consistent:

```
QuestDBSans-Regular.otf
QuestDBSans-Bold.otf
QuestDBSans-Italic.otf
QuestDBSans-BoldItalic.otf
QuestDBMono-Regular.otf
```

## How the template uses them

Once the files are here, the templates point `fontspec` at this folder instead
of the macOS system fonts:

```latex
\setmainfont{QuestDBSans}[
  Path = <path-to>/fonts/, Extension = .otf,
  UprightFont = *-Regular, BoldFont = *-Bold,
  ItalicFont = *-Italic, BoldItalicFont = *-BoldItalic ]
\setmonofont{QuestDBMono}[
  Path = <path-to>/fonts/, Extension = .otf,
  UprightFont = *-Regular, Scale = 0.85 ]
```

> Note: confirm the font licence permits **embedding in distributed PDFs**
> before committing the files to the repo.

# Fonts

Three families, vendored as woff2 subsets. All three are **SIL Open Font
License 1.1** — the full text is in `OFL-1.1.txt`, and the licence requires it
to travel with the files, so it ships inside the app.

The faces are declared in `apps/desktop/src/renderer/src/index.css`, which also
explains the subset choice and why `font-display: block`.

| File | Family | Copyright | Upstream |
|---|---|---|---|
| `inter-latin.woff2`, `inter-latin-ext.woff2`, `inter-cyrillic.woff2` | Inter, variable 100–900 | Copyright (c) 2016 The Inter Project Authors | https://github.com/rsms/inter |
| `mada-latin.woff2`, `mada-latin-ext.woff2` | Mada, variable 200–900 | Copyright 2015-2022 The Mada Project Authors, with Reserved Font Name "Source" | https://github.com/aliftype/mada |
| `noto-sans-arabic.woff2` | Noto Sans Arabic, variable 100–900 | Copyright 2022 The Noto Project Authors | https://github.com/notofonts/arabic |

## Where the files come from

Google Fonts' own subsets, downloaded from `fonts.gstatic.com` — Inter v20,
Mada v21, Noto Sans Arabic v33. They are the same files Sparks gets through
`next/font/google`, so the two products render the same shapes.

The `unicode-range` in the CSS is copied from the stylesheet Google serves for
each family. A range that drifts from the file it describes does not warn: the
glyphs are simply never asked for. If a file here is replaced, its range comes
from the same place, at the same time.

## Reserved Font Name

Mada carries one ("Source"). OFL 1.1 forbids using a reserved name for a
modified version, so these files must stay as downloaded. Subsetting is what
Google already did; we do not re-subset or re-name them.

# Contact Sheet fixtures

All assets here were created for this tool, without downloading or copying another font or image.

- `tiny.png`: original 2 by 2 RGBA PNG, made with Python's `struct` and `zlib` standard-library modules.
- `tiny.svg`: original rectangle, gradient and circle; its namespace is an identifier, not a fetched resource.
- `fixture.ttf`: original 4,332-byte TrueType font, assembled with Python's `struct` standard-library module. It has static rectangle outlines, a format-4 character map, and the ten tables `OS/2`, `cmap`, `glyf`, `head`, `hhea`, `hmtx`, `loca`, `maxp`, `name`, `post`. It covers the letters of "The work speaks clearly.", in both cases, with shared uppercase outlines, plus a space, period and missing-glyph box. It is a deliberately small embedding fixture, not a production typeface. Its family is Contact Sheet Fixture, with no reserved font names. Its licence is also in its name table.
- `pick.json`: all four pick item kinds, including two palettes and both local image formats. The example source address is displayed as text and never fetched.
- `brand-boards.json`: three invented boards in two groups for Sample Person (SP), with the sentence "Small things, made to last." Every face uses `fixture.ttf`; one board is recommended, one replaces the monogram with `tiny.svg`, and one starts in dark. The first board uses a highlight band in the panel role, and the second has a turbulence-filter texture with an internal reference and opacity. The SVG shapes and the role colours are original fixture content. The font's deliberately limited glyph coverage remains suitable for embedding checks only; use complete licensed faces for actual boards.

## Licence

The original fixture images, font and JSON specs in this directory are dedicated to the public domain under CC0 1.0 Universal. They may be used, modified, embedded and redistributed for any purpose without attribution. To the extent a public-domain dedication is not effective, permission is granted to do all of those things without restriction. These fixtures are provided without warranty.

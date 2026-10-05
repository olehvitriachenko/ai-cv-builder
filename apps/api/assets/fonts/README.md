# Embedded fonts for PDF export

The CV PDF embeds these fonts so Latin (with accents) and Cyrillic text renders correctly; the built-in
PDF fonts have no Cyrillic. They are static TrueType files because `@react-pdf/renderer` does not
support variable fonts. Both families are licensed under the SIL Open Font License 1.1 (see the
`*-OFL.txt` files) and match the on-screen A4 preview (Inter for headings and meta text, Lora for body text).

| File | Family / style | Source |
|------|----------------|--------|
| `Inter-Regular.ttf`, `Inter-Medium.ttf`, `Inter-SemiBold.ttf` | Inter 4.1 (400, 500, 600) | `extras/ttf/` in https://github.com/rsms/inter/releases/tag/v4.1 |
| `Lora-Regular.ttf`, `Lora-Italic.ttf` | Lora 3.021 (regular, italic) | `fonts/ttf/` in https://github.com/cyrealtype/Lora-Cyrillic at tag `v3.021` |

The files are copied to `dist/assets/fonts` by `nest build` (see `nest-cli.json`) and loaded by
`src/modules/pdf/export/cv-pdf.fonts.ts`.

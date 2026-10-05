# PDF layout fixture

`docx-mixed-en-uk.pdf` contains fictional CV information only. It was produced from a DOCX using LibreOffice's PDF export during the 6 October 2026 recognition investigation; it is not a Microsoft Word/Canva/Figma export. It has one selectable-text page and embedded fonts, so tests need no office application or font installation.

The document renders correctly, but its text stream places punctuation and mixed-script fragments out of visual order. In particular, the qualification's apostrophe is a separate span overlapping a longer text item. This fixture prevents claiming that simple coordinate sorting can safely reconstruct every value.

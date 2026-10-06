import { Module } from '@nestjs/common';
import { CvPdfRenderer } from './export/cv-pdf-renderer.service.js';
import { PdfTextExtractor } from './pdf-text-extractor.service.js';

@Module({
  providers: [PdfTextExtractor, CvPdfRenderer],
  exports: [PdfTextExtractor, CvPdfRenderer],
})
export class PdfModule {}

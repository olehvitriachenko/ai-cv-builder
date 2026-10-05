import { Module } from '@nestjs/common';
import { PdfTextExtractor } from './pdf-text-extractor.service.js';

@Module({
  providers: [PdfTextExtractor],
  exports: [PdfTextExtractor],
})
export class PdfModule {}

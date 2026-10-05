import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiModule } from '../ai/ai.module.js';
import { PdfModule } from '../pdf/pdf.module.js';
import { CvController } from './cv.controller.js';
import { ClarificationService } from './services/clarification.service.js';
import { CvEditorService } from './services/cv-editor.service.js';
import { CvExportService } from './services/cv-export.service.js';
import { CvService } from './services/cv.service.js';
import { APPLY_OPTIONS, applyOptionsFactory } from './clarification/apply.options.js';
import { GENERATION_OPTIONS, generationOptionsFactory } from './generation/generation.options.js';
import { GenerationProcessor } from './generation/generation-processor.service.js';
import { GenerationRunner } from './generation/generation-runner.service.js';

@Module({
  imports: [AiModule, PdfModule],
  controllers: [CvController],
  providers: [
    CvService,
    CvEditorService,
    CvExportService,
    ClarificationService,
    GenerationProcessor,
    GenerationRunner,
    { provide: GENERATION_OPTIONS, inject: [ConfigService], useFactory: generationOptionsFactory },
    { provide: APPLY_OPTIONS, inject: [ConfigService], useFactory: applyOptionsFactory },
  ],
})
export class CvModule {}

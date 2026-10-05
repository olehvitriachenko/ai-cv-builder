import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiModule } from '../ai/ai.module.js';
import { PdfModule } from '../pdf/pdf.module.js';
import { CvController } from './controllers/cv.controller.js';
import { CvService } from './services/cv.service.js';
import { GENERATION_OPTIONS, generationOptionsFactory } from './generation/generation.options.js';
import { GenerationProcessor } from './generation/generation-processor.service.js';
import { GenerationRunner } from './generation/generation-runner.service.js';

@Module({
  imports: [AiModule, PdfModule],
  controllers: [CvController],
  providers: [
    CvService,
    GenerationProcessor,
    GenerationRunner,
    { provide: GENERATION_OPTIONS, inject: [ConfigService], useFactory: generationOptionsFactory },
  ],
})
export class CvModule {}

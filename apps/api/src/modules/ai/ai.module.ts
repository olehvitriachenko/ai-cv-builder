import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicCvGenerator } from './anthropic-cv-generator.js';
import { CvGenerator } from './cv-generator.js';

@Module({
  providers: [
    {
      provide: CvGenerator,
      inject: [ConfigService],
      // Without an API key this still builds: generate() reports NOT_CONFIGURED and the app boots.
      useFactory: (config: ConfigService): CvGenerator =>
        new AnthropicCvGenerator({
          apiKey: config.get<string | undefined>('ANTHROPIC_API_KEY'),
          model: config.getOrThrow<string>('ANTHROPIC_MODEL'),
          timeoutMs: config.getOrThrow<number>('ANTHROPIC_TIMEOUT_MS'),
        }),
    },
  ],
  exports: [CvGenerator],
})
export class AiModule {}

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicAnswerApplier } from './services/anthropic-answer-applier.js';
import { AnthropicCvGenerator } from './services/anthropic-cv-generator.js';
import { CvAnswerApplier } from './cv-answer-applier.js';
import { apiKeyFromEnv } from './api-key.js';
import { CvGenerator } from './cv-generator.js';

@Module({
  providers: [
    {
      provide: CvGenerator,
      inject: [ConfigService],
      // Without an API key this still builds: generate() reports NOT_CONFIGURED and the app boots.
      useFactory: (config: ConfigService): CvGenerator =>
        new AnthropicCvGenerator({
          apiKey: apiKeyFromEnv(config.get<string | undefined>('ANTHROPIC_API_KEY')),
          model: config.getOrThrow<string>('ANTHROPIC_MODEL'),
          timeoutMs: config.getOrThrow<number>('ANTHROPIC_TIMEOUT_MS'),
        }),
    },
    {
      provide: CvAnswerApplier,
      inject: [ConfigService],
      // Same rules as the generator: no key still builds, apply() reports NOT_CONFIGURED. The short
      // per-attempt timeout keeps a synchronous apply from hanging the request.
      useFactory: (config: ConfigService): CvAnswerApplier =>
        new AnthropicAnswerApplier({
          apiKey: apiKeyFromEnv(config.get<string | undefined>('ANTHROPIC_API_KEY')),
          model: config.getOrThrow<string>('ANTHROPIC_MODEL'),
          timeoutMs: config.getOrThrow<number>('ANSWER_APPLY_TIMEOUT_MS'),
        }),
    },
  ],
  exports: [CvGenerator, CvAnswerApplier],
})
export class AiModule {}

import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { CvAnswerApplier, type AnswerPatchRequest } from '../cv-answer-applier.js';
import { ProviderError } from '../cv-generator.js';
import {
  ANSWER_PATCH_PROMPT_VERSION,
  buildAnswerPatchSystemPrompt,
  buildAnswerPatchUserContent,
} from '../prompts/answer-patch.prompt.js';
import { answerPatchSchemas } from '../schemas/answer-patch.schema.js';
import {
  createAnthropicClient,
  toProviderError,
  type AnthropicMessagesClient,
  type AnthropicSettings,
} from './anthropic-cv-generator.js';

/** A patch is a handful of short strings; this is far above what one answer can need. */
const MAX_TOKENS = 2_000;

/**
 * Applies one clarification answer through Anthropic with structured output limited to the
 * section's patch schema. Same boundary as `AnthropicCvGenerator`: no API key in prompts, provider
 * messages never surface (only safe tokens), and no key means `NOT_CONFIGURED` rather than a crash.
 */
export class AnthropicAnswerApplier extends CvAnswerApplier {
  readonly modelId: string;
  readonly promptVersion = ANSWER_PATCH_PROMPT_VERSION;

  private readonly client: AnthropicMessagesClient | undefined;

  constructor(
    private readonly settings: AnthropicSettings,
    client?: AnthropicMessagesClient,
  ) {
    super();
    this.modelId = settings.model;
    this.client =
      settings.apiKey === undefined
        ? undefined
        : (client ?? createAnthropicClient({ apiKey: settings.apiKey, timeoutMs: settings.timeoutMs }));
  }

  async apply(request: AnswerPatchRequest): Promise<unknown> {
    if (!this.client) {
      throw new ProviderError('NOT_CONFIGURED');
    }

    let message;
    try {
      message = await this.client.messages.create(
        {
          model: this.settings.model,
          max_tokens: MAX_TOKENS,
          system: buildAnswerPatchSystemPrompt(request.scope.section),
          messages: [{ role: 'user', content: buildAnswerPatchUserContent(request) }],
          output_config: {
            format: zodOutputFormat(answerPatchSchemas[request.scope.section]),
            effort: 'low',
          },
        },
        { signal: request.signal, timeout: this.settings.timeoutMs },
      );
    } catch (error) {
      throw toProviderError(error);
    }

    if (message.stop_reason === 'refusal') {
      throw new ProviderError('REFUSED');
    }
    if (message.stop_reason === 'max_tokens') {
      return null;
    }

    const text = message.content.find((block) => block.type === 'text');
    if (!text || text.type !== 'text') {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(text.text);
      return parsed;
    } catch {
      return null;
    }
  }
}

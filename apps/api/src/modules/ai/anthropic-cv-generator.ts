import Anthropic, {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  PermissionDeniedError,
} from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { CvGenerator, ProviderError, type CvGeneratorRequest } from './cv-generator.js';
import { llmCvOutputSchema } from './llm-cv-output.schema.js';
import { PROMPT_VERSION, buildSystemPrompt, buildUserContent } from './prompts/cv-draft.prompt.js';

/**
 * The ONLY file that imports the Anthropic SDK. Everything provider-specific stays here: the
 * request shape, structured output, error classification and the missing-key behaviour.
 */

/** Thinking tokens count toward max_tokens; the structured CV itself is a few thousand tokens. */
const MAX_TOKENS = 16_000;

export interface AnthropicSettings {
  /** Absent when no key is configured; the app still starts and `generate` reports NOT_CONFIGURED. */
  apiKey: string | undefined;
  model: string;
  /** Per-request SDK timeout. */
  timeoutMs: number;
}

/** The slice of the SDK client this adapter uses, so tests can inject a fake. */
export interface AnthropicMessagesClient {
  messages: {
    create(
      params: Anthropic.Messages.MessageCreateParamsNonStreaming,
      options?: { signal?: AbortSignal; timeout?: number },
    ): Promise<Pick<Anthropic.Messages.Message, 'content' | 'stop_reason'>>;
  };
}

/**
 * `maxRetries: 0` on purpose: the SDK's hidden retries would break the "at most one retry per
 * generation" rule. The pipeline owns the single, visible retry.
 */
export function createAnthropicClient(settings: { apiKey: string; timeoutMs: number }): Anthropic {
  return new Anthropic({ apiKey: settings.apiKey, maxRetries: 0, timeout: settings.timeoutMs });
}

/**
 * Whether repeating the request may succeed. The provider's own `x-should-retry` header wins;
 * without it the HTTP status decides. SDK retries are off (`maxRetries: 0`), so this only feeds
 * the application's single, visible retry.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof APIUserAbortError) {
    return false;
  }

  if (error instanceof APIConnectionError) {
    // Includes APIConnectionTimeoutError.
    return true;
  }

  if (!(error instanceof APIError)) {
    return false;
  }

  const shouldRetry = error.headers?.get('x-should-retry');
  if (shouldRetry === 'true') {
    return true;
  }
  if (shouldRetry === 'false') {
    return false;
  }

  const { status } = error;
  return (
    status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500)
  );
}

function toProviderError(error: unknown): unknown {
  if (error instanceof APIUserAbortError) {
    // Our own deadline fired; the caller recognises its aborted signal.
    return error;
  }
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    // A configuration problem is never transient, whatever the retry header says.
    return new ProviderError('NOT_CONFIGURED', String(error.status));
  }
  if (isRetryable(error)) {
    const detail = error instanceof APIError ? (error.status ?? error.constructor.name) : '';
    return new ProviderError('TRANSIENT', String(detail));
  }
  if (error instanceof APIError) {
    return new ProviderError('BAD_REQUEST', String(error.status ?? error.constructor.name));
  }
  return error;
}

export class AnthropicCvGenerator extends CvGenerator {
  readonly modelId: string;
  readonly promptVersion = PROMPT_VERSION;

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
        : (client ??
          createAnthropicClient({ apiKey: settings.apiKey, timeoutMs: settings.timeoutMs }));
  }

  async generate(request: CvGeneratorRequest): Promise<unknown> {
    if (!this.client) {
      throw new ProviderError('NOT_CONFIGURED');
    }

    let message: Pick<Anthropic.Messages.Message, 'content' | 'stop_reason'>;
    try {
      message = await this.client.messages.create(
        {
          model: this.settings.model,
          max_tokens: MAX_TOKENS,
          system: buildSystemPrompt(),
          messages: [
            {
              role: 'user',
              content: buildUserContent({
                sourceText: request.sourceText,
                targetRole: request.targetRole,
                feedback: request.feedback,
              }),
            },
          ],
          output_config: { format: zodOutputFormat(llmCvOutputSchema), effort: 'medium' },
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
      // Truncated JSON: report "no usable output" so it fails validation like any malformed answer.
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

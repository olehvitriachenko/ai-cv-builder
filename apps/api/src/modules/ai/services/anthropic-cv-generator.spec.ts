import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from '@anthropic-ai/sdk';
import {
  AnthropicCvGenerator,
  createAnthropicClient,
  isRetryable,
  type AnthropicMessagesClient,
} from './anthropic-cv-generator.js';
import { ProviderError } from '../cv-generator.js';
import { llmCvOutputSchema } from '../schemas/llm-cv-output.schema.js';
import { PROMPT_VERSION } from '../prompts/cv-draft.prompt.js';

type CreateFn = AnthropicMessagesClient['messages']['create'];
type MessageResult = Awaited<ReturnType<CreateFn>>;

const VALID_OUTPUT = {
  contact: { fullName: 'Ada', email: null, phone: null, location: null, links: [] },
  summary: null,
  experience: [],
  education: [],
  skillCategories: [],
  questions: [],
};

function textResult(
  text: string,
  stopReason: MessageResult['stop_reason'] = 'end_turn',
): MessageResult {
  return { stop_reason: stopReason, content: [{ type: 'text', text, citations: null }] };
}

function setup(result: MessageResult | Error, apiKey: string | null = 'sk-test') {
  const create = vi.fn<CreateFn>(async () => {
    if (result instanceof Error) {
      throw result;
    }
    return result;
  });
  const generator = new AnthropicCvGenerator(
    { apiKey: apiKey ?? undefined, model: 'claude-opus-5-5', timeoutMs: 90_000 },
    { messages: { create } },
  );
  return { create, generator };
}

const REQUEST = { sourceText: 'Ada worked at Acme Corp.', targetRole: 'Backend Engineer' };

function apiError(status: number, headers: Record<string, string> = {}): APIError {
  return APIError.generate(
    status,
    { error: { message: 'secret provider detail' } },
    undefined,
    new Headers(headers),
  );
}

describe('AnthropicCvGenerator', () => {
  it('exposes the configured model and the prompt version', () => {
    const { generator } = setup(textResult('{}'));

    expect(generator.modelId).toBe('claude-opus-5-5');
    expect(generator.promptVersion).toBe(PROMPT_VERSION);
  });

  describe('request', () => {
    it('sends model, token budget, structured output and the prompts as separate fields', async () => {
      const { create, generator } = setup(textResult(JSON.stringify(VALID_OUTPUT)));
      const controller = new AbortController();

      await generator.generate({ ...REQUEST, signal: controller.signal });

      expect(create).toHaveBeenCalledTimes(1);
      const [params, options] = create.mock.calls[0]!;
      expect(params.model).toBe('claude-opus-5-5');
      expect(params.max_tokens).toBe(16_000);
      expect(params.output_config?.effort).toBe('medium');
      expect(params.output_config?.format?.type).toBe('json_schema');
      expect(typeof params.system).toBe('string');
      expect(params.system).not.toContain(REQUEST.sourceText);
      expect(params.messages).toHaveLength(1);
      expect(params.messages[0]).toMatchObject({ role: 'user' });
      expect(JSON.stringify(params.messages[0]!.content)).toContain(REQUEST.sourceText);
      expect(options?.signal).toBe(controller.signal);
      expect(options?.timeout).toBe(90_000);
    });

    it('sets no sampling, tool-choice or thinking parameters', async () => {
      const { create, generator } = setup(textResult(JSON.stringify(VALID_OUTPUT)));

      await generator.generate(REQUEST);

      const [params] = create.mock.calls[0]!;
      for (const forbidden of [
        'temperature',
        'top_p',
        'top_k',
        'tool_choice',
        'thinking',
        'tools',
      ]) {
        expect(params).not.toHaveProperty(forbidden);
      }
    });

    it('passes retry feedback to the prompt', async () => {
      const { create, generator } = setup(textResult(JSON.stringify(VALID_OUTPUT)));

      await generator.generate({ ...REQUEST, feedback: ['contact.email.unsupported'] });

      expect(JSON.stringify(create.mock.calls[0]![0].messages[0]!.content)).toContain(
        'contact.email.unsupported',
      );
    });

    it('builds the SDK client without hidden retries and with the request timeout', () => {
      const client = createAnthropicClient({ apiKey: 'sk-test', timeoutMs: 45_000 });

      expect(client.maxRetries).toBe(0);
      expect(client.timeout).toBe(45_000);
    });
  });

  describe('response', () => {
    it('parses the text block into unknown that the output schema accepts', async () => {
      const { generator } = setup(textResult(JSON.stringify(VALID_OUTPUT)));

      const output = await generator.generate(REQUEST);

      expect(llmCvOutputSchema.safeParse(output).success).toBe(true);
    });

    it('skips non-text blocks such as thinking', async () => {
      const { generator } = setup({
        stop_reason: 'end_turn',
        content: [
          { type: 'thinking', thinking: 'hmm', signature: 'sig' },
          { type: 'text', text: JSON.stringify(VALID_OUTPUT), citations: null },
        ],
      });

      expect(llmCvOutputSchema.safeParse(await generator.generate(REQUEST)).success).toBe(true);
    });

    it.each([
      ['unparseable text', textResult('not json {')],
      ['a missing text block', { stop_reason: 'end_turn', content: [] } satisfies MessageResult],
      ['a max_tokens truncation', textResult('{"contact": {"fullName": "Ad', 'max_tokens')],
    ])('returns a value that fails the schema (no throw) for %s', async (_name, result) => {
      const { generator } = setup(result);

      const output = await generator.generate(REQUEST);

      expect(llmCvOutputSchema.safeParse(output).success).toBe(false);
    });

    it('maps a refusal to ProviderError REFUSED', async () => {
      const { generator } = setup(textResult('', 'refusal'));

      await expect(generator.generate(REQUEST)).rejects.toMatchObject({ kind: 'REFUSED' });
    });
  });

  describe('error mapping', () => {
    it.each([
      [401, 'NOT_CONFIGURED'],
      [403, 'NOT_CONFIGURED'],
      [400, 'BAD_REQUEST'],
      [404, 'BAD_REQUEST'],
      [422, 'BAD_REQUEST'],
      [408, 'TRANSIENT'],
      [409, 'TRANSIENT'],
      [429, 'TRANSIENT'],
      [500, 'TRANSIENT'],
      [529, 'TRANSIENT'],
    ])('maps HTTP %i to %s without leaking the provider message', async (status, kind) => {
      const { generator } = setup(apiError(status));

      const failure = await generator.generate(REQUEST).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ProviderError);
      expect(failure).toMatchObject({ kind, detail: String(status) });
      expect(JSON.stringify(failure)).not.toContain('secret provider detail');
      expect(String(failure)).not.toContain('secret provider detail');
    });

    it('maps connection failures and the SDK timeout to TRANSIENT', async () => {
      for (const error of [new APIConnectionError({}), new APIConnectionTimeoutError()]) {
        const { generator } = setup(error);
        await expect(generator.generate(REQUEST)).rejects.toMatchObject({ kind: 'TRANSIENT' });
      }
    });

    it.each([
      [400, 'true', 'TRANSIENT'],
      [404, 'true', 'TRANSIENT'],
      [429, 'false', 'BAD_REQUEST'],
      [500, 'false', 'BAD_REQUEST'],
      [529, 'false', 'BAD_REQUEST'],
    ])(
      'lets x-should-retry override the status: HTTP %i with %s maps to %s',
      async (status, header, kind) => {
        const { generator } = setup(apiError(status, { 'x-should-retry': header }));

        await expect(generator.generate(REQUEST)).rejects.toMatchObject({ kind });
      },
    );

    it.each([401, 403])(
      'never treats HTTP %i as transient, even with x-should-retry: true',
      async (status) => {
        const { generator } = setup(apiError(status, { 'x-should-retry': 'true' }));

        await expect(generator.generate(REQUEST)).rejects.toMatchObject({ kind: 'NOT_CONFIGURED' });
      },
    );

    it('treats a provider error with no status and no retry header as not retryable', async () => {
      const { generator } = setup(new APIError(undefined, undefined, 'boom', undefined));

      await expect(generator.generate(REQUEST)).rejects.toMatchObject({ kind: 'BAD_REQUEST' });
    });

    it('lets an abort from our own signal propagate unchanged', async () => {
      const abort = new APIUserAbortError();
      const { generator } = setup(abort);

      await expect(generator.generate(REQUEST)).rejects.toBe(abort);
    });

    it('lets unexpected errors propagate unchanged', async () => {
      const boom = new TypeError('boom');
      const { generator } = setup(boom);

      await expect(generator.generate(REQUEST)).rejects.toBe(boom);
    });
  });

  describe('without an API key', () => {
    it('reports NOT_CONFIGURED without calling the client', async () => {
      const { create, generator } = setup(textResult('{}'), null);

      await expect(generator.generate(REQUEST)).rejects.toMatchObject({ kind: 'NOT_CONFIGURED' });
      expect(create).not.toHaveBeenCalled();
    });

    it('can be constructed without a client or key, so the app boots', () => {
      expect(
        () => new AnthropicCvGenerator({ apiKey: undefined, model: 'm', timeoutMs: 1000 }),
      ).not.toThrow();
    });
  });
});

describe('isRetryable', () => {
  it('is false for our own abort, even though it is an APIError', () => {
    expect(isRetryable(new APIUserAbortError())).toBe(false);
  });

  it('is true for connection failures and the SDK timeout', () => {
    expect(isRetryable(new APIConnectionError({}))).toBe(true);
    expect(isRetryable(new APIConnectionTimeoutError())).toBe(true);
  });

  it('is false for anything that is not an Anthropic API error', () => {
    expect(isRetryable(new TypeError('boom'))).toBe(false);
    expect(isRetryable('429')).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });

  it.each([408, 409, 429, 500, 502, 529])(
    'is true for HTTP %i without a retry header',
    (status) => {
      expect(isRetryable(apiError(status))).toBe(true);
    },
  );

  it.each([400, 401, 403, 404, 422])('is false for HTTP %i without a retry header', (status) => {
    expect(isRetryable(apiError(status))).toBe(false);
  });

  it('lets the provider header win over the status in both directions', () => {
    expect(isRetryable(apiError(400, { 'x-should-retry': 'true' }))).toBe(true);
    expect(isRetryable(apiError(503, { 'x-should-retry': 'false' }))).toBe(false);
  });

  it('ignores an unrecognised header value and falls back to the status', () => {
    expect(isRetryable(apiError(500, { 'x-should-retry': 'maybe' }))).toBe(true);
    expect(isRetryable(apiError(400, { 'x-should-retry': 'maybe' }))).toBe(false);
  });

  it('is false for an API error without a status or headers', () => {
    expect(isRetryable(new APIError(undefined, undefined, 'boom', undefined))).toBe(false);
  });
});

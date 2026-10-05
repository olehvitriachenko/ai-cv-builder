import { APIConnectionError, APIError, AuthenticationError } from '@anthropic-ai/sdk';
import { ProviderError } from '../cv-generator.js';
import { ANSWER_PATCH_PROMPT_VERSION, type ScopeContent } from '../prompts/answer-patch.prompt.js';
import { AnthropicAnswerApplier } from './anthropic-answer-applier.js';
import type { AnthropicMessagesClient } from './anthropic-cv-generator.js';

type CreateFn = AnthropicMessagesClient['messages']['create'];
type MessageResult = Awaited<ReturnType<CreateFn>>;

function textResult(text: string, stopReason: MessageResult['stop_reason'] = 'end_turn'): MessageResult {
  return { stop_reason: stopReason, content: [{ type: 'text', text, citations: null }] };
}

function setup(result: MessageResult | Error, apiKey: string | null = 'sk-test') {
  const create = vi.fn<CreateFn>(async () => {
    if (result instanceof Error) {
      throw result;
    }
    return result;
  });
  const applier = new AnthropicAnswerApplier(
    { apiKey: apiKey ?? undefined, model: 'claude-sonnet-5-5', timeoutMs: 20_000 },
    { messages: { create } },
  );
  return { create, applier };
}

const SCOPE: ScopeContent = { section: 'SKILLS', categories: [{ name: 'Backend', skills: ['Node.js'] }] };
const REQUEST = { scope: SCOPE, question: 'Other tools?', answer: 'Go and Rust', targetRole: 'Backend Engineer' };

describe('AnthropicAnswerApplier', () => {
  it('exposes the model and the prompt version', () => {
    const { applier } = setup(textResult('{}'));

    expect(applier.modelId).toBe('claude-sonnet-5-5');
    expect(applier.promptVersion).toBe(ANSWER_PATCH_PROMPT_VERSION);
  });

  it('sends one structured-output request scoped to the section, with the abort signal and timeout', async () => {
    const { applier, create } = setup(textResult('{"skills":["Go"]}'));
    const controller = new AbortController();

    await applier.apply({ ...REQUEST, signal: controller.signal });

    expect(create).toHaveBeenCalledTimes(1);
    const [params, options] = create.mock.calls[0] ?? [];
    expect(params?.model).toBe('claude-sonnet-5-5');
    expect(params?.max_tokens).toBeGreaterThan(0);
    expect(params?.output_config?.format?.type).toBe('json_schema');
    expect(JSON.stringify(params?.output_config)).toContain('skills');
    expect(JSON.stringify(params?.output_config)).not.toContain('bullets');
    expect(typeof params?.system).toBe('string');
    expect(options?.signal).toBe(controller.signal);
    expect(options?.timeout).toBe(20_000);
  });

  it('keeps instructions in the system prompt and data in the user message', async () => {
    const { applier, create } = setup(textResult('{"skills":[]}'));

    await applier.apply(REQUEST);

    const [params] = create.mock.calls[0] ?? [];
    const user = JSON.stringify(params?.messages);
    expect(user).toContain('Go and Rust');
    expect(user).toContain('Other tools?');
    expect(JSON.stringify(params?.system)).not.toContain('Go and Rust');
    expect(JSON.stringify(params)).not.toContain('sk-test');
  });

  it('returns the parsed JSON as unknown for the caller to validate', async () => {
    const { applier } = setup(textResult('{"skills":["Go"],"extra":true}'));

    expect(await applier.apply(REQUEST)).toEqual({ skills: ['Go'], extra: true });
  });

  it('returns null for unusable output instead of throwing', async () => {
    expect(await setup(textResult('not json')).applier.apply(REQUEST)).toBeNull();
    expect(await setup(textResult('{"skills":["Go"', 'max_tokens')).applier.apply(REQUEST)).toBeNull();
    expect(await setup({ stop_reason: 'end_turn', content: [] }).applier.apply(REQUEST)).toBeNull();
  });

  it('reports a refusal as a REFUSED provider error', async () => {
    await expect(setup(textResult('', 'refusal')).applier.apply(REQUEST)).rejects.toMatchObject({
      name: 'ProviderError',
      kind: 'REFUSED',
    });
  });

  it('reports NOT_CONFIGURED without a key, and never calls the provider', async () => {
    const { applier, create } = setup(textResult('{}'), null);

    await expect(applier.apply(REQUEST)).rejects.toMatchObject({ kind: 'NOT_CONFIGURED' });
    expect(create).not.toHaveBeenCalled();
  });

  it('classifies authentication failures as NOT_CONFIGURED and connection/5xx failures as TRANSIENT, without provider text', async () => {
    const auth = AuthenticationError.generate(401, { error: { message: 'secret provider detail' } }, undefined, new Headers());
    const network = new APIConnectionError({ message: 'secret provider detail' });
    const server = APIError.generate(503, { error: { message: 'secret provider detail' } }, undefined, new Headers());

    for (const [error, kind] of [[auth, 'NOT_CONFIGURED'], [network, 'TRANSIENT'], [server, 'TRANSIENT']] as const) {
      const caught = await setup(error).applier.apply(REQUEST).catch((thrown: unknown) => thrown);

      expect(caught).toBeInstanceOf(ProviderError);
      expect(caught).toMatchObject({ kind });
      expect(JSON.stringify(caught)).not.toContain('secret provider detail');
      expect(caught instanceof Error ? caught.message : '').not.toContain('secret provider detail');
    }
  });
});

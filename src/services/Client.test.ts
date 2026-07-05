import type Anthropic from '@anthropic-ai/sdk';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { Client } from './Client';

// The Anthropic SDK is faked so the facade can be tested without network access: `Client` builds
// its own `Anthropic` instance in the constructor, so we replace the module's default export with a
// stub whose `messages.create` / `models.list` we control per test.
const mockCreate = jest.fn<(params: Anthropic.MessageCreateParams) => Promise<Anthropic.Message>>();
const mockList = jest.fn<() => Anthropic.ModelInfo[]>();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    messages: { create: mockCreate },
    models: { list: mockList },
  })),
}));

function buildMessage(
  content: Anthropic.ContentBlock[],
  usage: Pick<Anthropic.Usage, 'input_tokens' | 'output_tokens'>,
): Anthropic.Message {
  return { content, usage } as Anthropic.Message;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Client.estimateCost', () => {
  it('prices usage against a known model matched by id prefix', () => {
    // API model ids are date-suffixed (e.g. "claude-haiku-4-5-20251001"), so pricing is matched by
    // prefix against the "claude-haiku-4-5" alias: $1 input + $5 output per million tokens.
    const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000 } as Anthropic.Usage;

    expect(Client.estimateCost('claude-haiku-4-5-20251001', usage)).toBe(6);
  });

  it('sums input and output costs at their separate rates', () => {
    // claude-opus-4-8: $5 input + $25 output per million. 2 * 5 + 0.5 * 25 = 22.5.
    const usage = { input_tokens: 2_000_000, output_tokens: 500_000 } as Anthropic.Usage;

    expect(Client.estimateCost('claude-opus-4-8', usage)).toBe(22.5);
  });

  it('returns null for a model with no known pricing', () => {
    const usage = { input_tokens: 1000, output_tokens: 1000 } as Anthropic.Usage;

    expect(Client.estimateCost('some-unknown-model', usage)).toBeNull();
  });
});

describe('Client.prompt', () => {
  it('splits the response into text and thinking blocks and estimates the cost', async () => {
    mockCreate.mockResolvedValue(buildMessage(
      [
        { citations: null, text: 'Hello', type: 'text' },
        { signature: '', thinking: 'reasoning', type: 'thinking' },
        { citations: null, text: ' world', type: 'text' },
      ],
      { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    ));

    const client = new Client({ apiKey: 'test-key' });
    const result = await client.prompt('do it', { maxTokens: 1024, model: 'claude-haiku-4-5' });

    expect(result.textBlocks).toEqual(['Hello', ' world']);
    expect(result.thinkingBlocks).toEqual(['reasoning']);
    expect(result.estimatedCost).toBe(6);
  });

  it('forwards effort and thinking to the request when set', async () => {
    mockCreate.mockResolvedValue(buildMessage([], { input_tokens: 0, output_tokens: 0 }));

    const client = new Client({ apiKey: 'test-key' });
    await client.prompt('do it', { effort: 'high', maxTokens: 1024, model: 'claude-opus-4-8', thinking: true });

    const params = mockCreate.mock.calls.at(0)?.[0];

    expect(params).toMatchObject({
      max_tokens: 1024,
      model: 'claude-opus-4-8',
      output_config: { effort: 'high' },
      thinking: { type: 'adaptive' },
    });
  });

  it('omits effort and thinking from the request when not set', async () => {
    mockCreate.mockResolvedValue(buildMessage([], { input_tokens: 0, output_tokens: 0 }));

    const client = new Client({ apiKey: 'test-key' });
    await client.prompt('do it', { maxTokens: 1024, model: 'claude-haiku-4-5' });

    const params = mockCreate.mock.calls.at(0)?.[0];

    expect(params).not.toHaveProperty('output_config');
    expect(params).not.toHaveProperty('thinking');
  });
});

describe('Client.listModelOptions', () => {
  it('maps model capabilities to the supported efforts, thinking flag, and max tokens', async () => {
    mockList.mockReturnValue([
      {
        capabilities: {
          effort: {
            high: { supported: true },
            low: { supported: true },
            max: { supported: false },
            medium: { supported: false },
            supported: true,
            xhigh: { supported: true },
          },
          thinking: { supported: true, types: { adaptive: { supported: true } } },
        },
        display_name: 'Test Model',
        id: 'claude-test-1',
        max_tokens: 8192,
      } as Anthropic.ModelInfo,
    ]);

    const client = new Client({ apiKey: 'test-key' });
    const options = await client.listModelOptions();

    expect(options).toEqual([
      { effort: ['low', 'high', 'xhigh'], id: 'claude-test-1', maxTokens: 8192, name: 'Test Model', thinking: true },
    ]);
  });

  it('reports no efforts and no thinking when the model has no capabilities', async () => {
    mockList.mockReturnValue([
      { capabilities: null, display_name: 'Bare Model', id: 'claude-test-2', max_tokens: null } as Anthropic.ModelInfo,
    ]);

    const client = new Client({ apiKey: 'test-key' });
    const options = await client.listModelOptions();

    expect(options).toEqual([
      { effort: [], id: 'claude-test-2', maxTokens: null, name: 'Bare Model', thinking: false },
    ]);
  });
});

import Anthropic from '@anthropic-ai/sdk';
import { requestUrl } from 'obsidian';

export type ModelEffort = 'high' | 'low' | 'max' | 'medium' | 'xhigh';

export interface ModelOption {
  effort: ModelEffort[];
  id: string;
  maxTokens: null | number;
  name: string;
  thinking: boolean;
}

export interface PromptOptions {
  effort?: ModelEffort;
  maxTokens: number;
  model: string;
  thinking?: boolean;
}

interface ModelPricing {
  input: number;
  output: number;
}

interface Options {
  apiKey: string;
}

interface PromptResult {
  estimatedCost: null | number;
  textBlocks: string[];
  thinkingBlocks: string[];
}

/**
 * Vendor-neutral facade over the Anthropic SDK: exposes prompt(), listModelOptions(), and cost
 * estimation, and owns all Anthropic-specific translation (thinking mode, effort levels, pricing)
 * so no other file needs to import Anthropic's own types.
 */
export class Client {
  public static readonly MODEL_EFFORT_DISPLAY_NAMES: Record<ModelEffort, string> = {
    high: 'High',
    low: 'Low',
    max: 'Max',
    medium: 'Medium',
    xhigh: 'Extra',
  };

  public static readonly MODEL_EFFORTS: ModelEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

  /**
   * Best-effort snapshot of published pricing, matched by model id prefix (model ids returned by
   * the API are often date-suffixed, e.g. "claude-haiku-4-5-20251001"). Not exposed by the Models
   * API itself, so this can go stale as pricing changes or new models ship. Prices are USD per
   * million tokens.
   * @see https://www.anthropic.com/pricing
   */
  private static readonly PRICING: Record<string, ModelPricing> = {
    'claude-fable-5': { input: 10, output: 50 },
    'claude-haiku-4-5': { input: 1, output: 5 },
    'claude-opus-4-6': { input: 5, output: 25 },
    'claude-opus-4-7': { input: 5, output: 25 },
    'claude-opus-4-8': { input: 5, output: 25 },
    'claude-sonnet-4-6': { input: 3, output: 15 },
    'claude-sonnet-5': { input: 3, output: 15 },
  };

  private readonly anthropic: Anthropic;

  constructor({ apiKey }: Options) {
    this.anthropic = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
      fetch: this.fetch.bind(this),
    });
  }

  public static estimateCost(modelId: string, usage: Anthropic.Usage): null | number {
    const pricing = Object.entries(Client.PRICING).find(([alias]) => modelId.startsWith(alias))?.[1];

    if (!pricing) {
      return null;
    }

    return (usage.input_tokens * pricing.input + usage.output_tokens * pricing.output) / 1_000_000;
  }

  private static getSupportedEfforts(capabilities: Anthropic.ModelCapabilities | null): ModelEffort[] {
    if (!capabilities?.effort.supported) {
      return [];
    }

    return Client.MODEL_EFFORTS.filter((effort) => {
      if (effort === 'xhigh') {
        return capabilities.effort.xhigh?.supported ?? false;
      }

      return capabilities.effort[effort].supported;
    });
  }

  public async listModelOptions(): Promise<ModelOption[]> {
    const modelOptions: ModelOption[] = [];

    for await (const model of this.anthropic.models.list()) {
      modelOptions.push({
        effort: Client.getSupportedEfforts(model.capabilities),
        id: model.id,
        maxTokens: model.max_tokens,
        name: model.display_name,
        thinking: model.capabilities?.thinking.types.adaptive.supported ?? false,
      });
    }

    return modelOptions;
  }

  public async prompt(prompt: string, { effort, maxTokens, model, thinking }: PromptOptions): Promise<PromptResult> {
    const message = await this.anthropic.messages.create({
      max_tokens: maxTokens,
      messages: [{ content: prompt, role: 'user' }],
      model,
      ...(effort && { output_config: { effort } }),
      ...(thinking && { thinking: { type: 'adaptive' } }),
    });

    const textBlocks = message.content.filter((block): block is Anthropic.TextBlock => block.type === 'text');
    const thinkingBlocks = message.content.filter(
      (block): block is Anthropic.ThinkingBlock => block.type === 'thinking',
    );

    return {
      estimatedCost: Client.estimateCost(model, message.usage),
      textBlocks: textBlocks.map(block => block.text),
      thinkingBlocks: thinkingBlocks.map(block => block.thinking),
    };
  }

  /**
   * Anthropic's SDK calls fetch() directly, which is subject to normal browser CORS in Obsidian's
   * renderer. Route it through requestUrl instead, which bypasses that restriction.
   */
  private async fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> {
    const url = input instanceof Request ? input.url : input.toString();
    const body = typeof init?.body === 'string' ? init.body : undefined;
    const method = init?.method ?? 'GET';
    const headers: Record<string, string> = {};

    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });

    console.debug('[Copyeditor] Request', { body, method, url });

    const response = await requestUrl({
      body,
      headers,
      method,
      throw: false,
      url,
    });

    if (response.status >= 400) {
      console.error('[Copyeditor] Response', { body: response.text, status: response.status });
    } else {
      console.debug('[Copyeditor] Response', { body: response.text, status: response.status });
    }

    return new Response(response.arrayBuffer, {
      headers: response.headers,
      status: response.status,
    });
  }
}

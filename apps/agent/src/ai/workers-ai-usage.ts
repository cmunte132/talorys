import { createParser } from "eventsource-parser";
import { estimateTokens, modelUsage, tokens, type Usage } from "./provider";

export interface StepMeter {
  inputEstimate: number;
  input?: number;
  output?: number;
  cached?: number;
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function capture(meter: StepMeter, response: unknown): void {
  const usage = (response as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown } } } | null)?.usage;
  if (!usage) return;
  meter.input = count(usage.prompt_tokens) ?? meter.input;
  meter.output = count(usage.completion_tokens) ?? meter.output;
  meter.cached = count(usage.prompt_tokens_details?.cached_tokens) ?? meter.cached;
}

/** Observe before workers-ai-provider turns missing usage fields into reported zeroes. */
export function meteredBinding(binding: Ai, steps: StepMeter[]): Ai {
  return new Proxy(binding, {
    get(target, key) {
      if (key !== "run") {
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async (...args: Parameters<Ai["run"]>) => {
        const inputs = args[1] as { messages?: unknown; tools?: unknown };
        const meter: StepMeter = {
          // The actual SDK-built prompt includes previous tool calls/results and tool schemas.
          inputEstimate: estimateTokens(JSON.stringify({ messages: inputs.messages, tools: inputs.tools })),
        };
        steps.push(meter);
        const response = await target.run(...args);
        if (!(response instanceof ReadableStream)) {
          capture(meter, response);
          return response;
        }
        const decoder = new TextDecoder();
        let observing = true;
        const parser = createParser({
          maxBufferSize: 1024 * 1024,
          onError: (error) => {
            if (error.type === "max-buffer-size-exceeded") observing = false;
          },
          onEvent: ({ data }) => {
            if (data === "[DONE]") return;
            try { capture(meter, JSON.parse(data)); } catch { /* Accounting must not change inference parsing. */ }
          },
        });
        return response.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            if (observing) parser.feed(decoder.decode(chunk, { stream: true }));
            controller.enqueue(chunk);
          },
          flush() {
            if (observing) parser.feed(decoder.decode());
            parser.reset();
          },
        }));
      };
    },
  });
}

export function stepUsage(model: string, meter: StepMeter, outputEstimate: number): Usage {
  return modelUsage(model, true, tokens(meter.input, meter.inputEstimate), tokens(meter.output, outputEstimate), meter.cached);
}

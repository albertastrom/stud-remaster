import { MODEL, TYPESAFE_URL } from "./defaults";
import type { JsonValue } from "./questions";

export type NoulAnswer = {
  type: "noul";
  noul: number;
};

export type SystemOneResponse = {
  model: string;
  answers: Record<string, NoulAnswer>;
  usage?: { input_tokens: number; output_tokens: number };
};

export class TypeSafeHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function systemOne(options: {
  apiKey: string;
  state: JsonValue;
  questions: Record<string, unknown>;
  model?: string;
  signal?: AbortSignal;
}): Promise<SystemOneResponse> {
  const body = {
    state: options.state,
    model: options.model ?? MODEL,
    questions: options.questions,
  };

  let attempt = 0;
  let lastError: unknown;
  while (attempt < 4) {
    attempt += 1;
    const response = await fetch(TYPESAFE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (response.status === 429 || response.status === 529) {
      lastError = new TypeSafeHttpError(response.status, "TypeSafe rate limited");
      const retryAfter = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : 400 * 2 ** (attempt - 1);
      await sleep(wait);
      continue;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new TypeSafeHttpError(
        response.status,
        text || `TypeSafe HTTP ${response.status}`,
      );
    }

    return (await response.json()) as SystemOneResponse;
  }

  throw lastError instanceof Error
    ? lastError
    : new TypeSafeHttpError(429, "TypeSafe rate limited");
}

export function readNoul(
  answers: Record<string, NoulAnswer>,
  id: string,
): number {
  const value = answers[id]?.noul;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Missing noul for ${id}`);
  }
  return Math.min(1, Math.max(0, value));
}

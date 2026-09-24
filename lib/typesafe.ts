import { MODEL, REQUEST_TIMEOUT_MS, TYPESAFE_URL } from "./defaults";
import type { JsonValue } from "./questions";

export type NoulAnswer = {
  type: "noul";
  noul: number;
};

export type SystemOneResponse = {
  model: string;
  answers: Record<string, NoulAnswer>;
};

export class TypeSafeHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MAX_ATTEMPTS = 4;

export async function systemOne(options: {
  apiKey: string;
  state: JsonValue;
  questions: Record<string, unknown>;
}): Promise<SystemOneResponse> {
  const body = JSON.stringify({
    state: options.state,
    model: MODEL,
    questions: options.questions,
  });

  for (let attempt = 1; ; attempt++) {
    const response = await fetch(TYPESAFE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const rateLimited = response.status === 429 || response.status === 529;
    if (rateLimited && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const wait = retryAfter > 0 ? retryAfter * 1000 : 400 * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new TypeSafeHttpError(response.status, text || `TypeSafe HTTP ${response.status}`);
    }

    return (await response.json()) as SystemOneResponse;
  }
}

export function readNoul(answers: Record<string, NoulAnswer>, id: string): number {
  const value = answers[id]?.noul;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Missing noul for ${id}`);
  }
  return Math.min(1, Math.max(0, value));
}

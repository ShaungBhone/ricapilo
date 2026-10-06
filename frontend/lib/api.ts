export const API = "/api/backend/api/v1";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
let csrf: string | null = null;
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = options.method || "GET";
  if (!["GET", "HEAD"].includes(method) && !csrf) {
    const r = await fetch(`${API}/csrf`, { credentials: "same-origin" });
    if (!r.ok) throw new ApiError("API ကို ချိတ်ဆက်၍မရပါ။", r.status);
    csrf = (await r.json()).token;
  }
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (csrf) headers.set("X-CSRF-TOKEN", csrf);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  if (res.status === 419) {
    csrf = null;
    throw new ApiError("စာမျက်နှာကို ပြန်ဖွင့်ပြီး ထပ်ကြိုးစားပါ။", 419);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      data.message || "တောင်းဆိုမှု မအောင်မြင်ပါ။",
      res.status,
    );
  }
  if (["/auth/login", "/auth/register", "/auth/logout"].includes(path))
    csrf = null;
  if (res.status === 204) return undefined as T;
  return res.json();
}
export const json = (data: unknown) => JSON.stringify(data);
export type User = {
  id: number;
  name: string;
  email: string;
  email_verified_at: string | null;
  is_admin: boolean;
};
export type Model = {
  id: string;
  name: string;
  kind: "text" | "speech" | "transcription";
  voices: (string | { id: string; name?: string })[];
  pricing: Record<string, string>;
};
export type Assistant = {
  id: number;
  name: string;
  instructions: string;
  first_message: string;
  llm_model: string;
  stt_model: string;
  tts_model: string;
  voice: string;
  silence_ms: number;
  enabled: boolean;
};
export type Video = {
  id: string;
  platform: string;
  title: string;
  creator: string;
  thumbnail: string;
  url: string;
  views: number | null;
  duration: number | string | null;
};
export type Caption = { text: string; startMs: number; endMs: number };
export type Project = {
  id: number;
  title: string;
  assistant_id: number;
  source: string;
  transcript: string | null;
  script: string | null;
  status: string;
  stage: string | null;
  error: string | null;
  format: "vertical" | "landscape";
  target_seconds: number;
  caption_style: string;
  captions: Caption[] | null;
  usage: unknown[] | null;
};
export type Conversation = {
  id: number;
  title: string;
  assistant_id: number;
  messages: { role: "user" | "assistant"; content: string }[];
};
export type Page<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
};

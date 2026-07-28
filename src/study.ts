import type { Ctx } from "./bot.js";

export type SummaryLength = "standard" | "rephrased" | "expanded" | "shortened";

export interface StudyDocument {
  fileId: string;
  name: string;
  size: number;
  type: string;
  uploadTime: number;
}

export interface StudySummary {
  content: string;
  lengthVersion: SummaryLength;
  generationTime: number;
  sourceDocument: StudyDocument;
}

export interface StudyJob {
  status: "processing" | "completed" | "failed";
  errorDetails?: string;
  retryCount: number;
  createdAt: number;
}

export interface StudyState {
  user: { telegramId: number; lastInteractionTime: number };
  documents: StudyDocument[];
  lastSummary?: StudySummary;
  jobs: StudyJob[];
  adminAlerts: boolean;
  failureThreshold: number;
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
let clock: () => number = () => Date.now();

/** A small seam for deterministic tests of retention and processing times. */
export function now(): number {
  return clock();
}

export function setClockForTests(value?: () => number): void {
  clock = value ?? (() => Date.now());
}

export function stateFor(ctx: Ctx): StudyState {
  const userId = ctx.from?.id ?? ctx.chat?.id ?? 0;
  const at = now();
  if (!ctx.session.study) {
    ctx.session.study = {
      user: { telegramId: userId, lastInteractionTime: at },
      documents: [],
      jobs: [],
      adminAlerts: false,
      failureThreshold: 3,
    };
  }
  const state = ctx.session.study;
  state.user.telegramId = userId;
  state.user.lastInteractionTime = at;
  state.jobs = state.jobs.filter((job) => at - job.createdAt < THIRTY_DAYS);
  return state;
}

export function adjustmentKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Rephrase", callback_data: "summary:rephrase" },
        { text: "Expand", callback_data: "summary:expand" },
        { text: "Shorten", callback_data: "summary:shorten" },
      ],
      [{ text: "⬅️ Menu", callback_data: "menu:main" }],
    ],
  };
}

function apiKey(): string | undefined {
  return typeof process === "undefined" ? undefined : process.env.OPENAI_API_KEY;
}

function botToken(ctx: Ctx): string | undefined {
  const workerToken = (ctx as Ctx & { env?: { BOT_TOKEN?: string } }).env?.BOT_TOKEN;
  return workerToken ?? (typeof process === "undefined" ? undefined : process.env.BOT_TOKEN);
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sentenceParts(value: string): string[] {
  return cleanText(value).match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
}

/** A real, deterministic fallback for text files when no AI key is configured. */
function extractiveSummary(text: string, target: number): string {
  const sentences = sentenceParts(text);
  if (sentences.length === 0) throw new Error("no readable text");
  const count = Math.min(Math.max(1, target), sentences.length);
  const chosen: string[] = [];
  const used = new Set<number>();
  for (let i = 0; i < count; i++) {
    const index = Math.floor((i * sentences.length) / count);
    if (!used.has(index)) {
      chosen.push(sentences[index]);
      used.add(index);
    }
  }
  return chosen.join(" ");
}

function targetFor(version: SummaryLength): string {
  if (version === "expanded") return "Write 7 to 10 concise sentences.";
  if (version === "shortened") return "Write 1 to 2 concise sentences.";
  if (version === "rephrased") return "Rephrase it with different wording while preserving every important point. Write 3 to 5 concise sentences.";
  return "Write 3 to 5 concise sentences.";
}

async function openAiSummary(input: { text?: string; bytes?: Uint8Array; mime?: string; name?: string }, version: SummaryLength): Promise<string> {
  const key = apiKey();
  if (!key) throw new Error("ai not configured");
  const content: Array<Record<string, string>> = [
    { type: "input_text", text: `${targetFor(version)} Return only the summary. The material may be technical; keep names, dates, and conclusions accurate.` },
  ];
  if (input.text) content.push({ type: "input_text", text: input.text });
  if (input.bytes && input.mime && input.name) {
    const encoded = bytesToBase64(input.bytes);
    content.push({
      type: "input_file",
      filename: input.name,
      file_data: `data:${input.mime};base64,${encoded}`,
    });
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-4.1-mini", input: [{ role: "user", content }], max_output_tokens: version === "expanded" ? 900 : 500 }),
  });
  if (!response.ok) throw new Error(response.status === 429 ? "AI is busy" : "AI request failed");
  const body = (await response.json()) as { output_text?: unknown };
  if (typeof body.output_text !== "string" || !cleanText(body.output_text)) throw new Error("AI returned no summary");
  return cleanText(body.output_text);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function supported(name: string, mime: string): boolean {
  const lower = name.toLowerCase();
  return mime.startsWith("image/") || mime === "application/pdf" || mime.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".pdf") || lower.endsWith(".docx");
}

async function download(ctx: Ctx, fileId: string): Promise<Uint8Array> {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) throw new Error("Telegram could not read that file");
  const token = botToken(ctx);
  if (!token) throw new Error("file access is not configured");
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!response.ok) throw new Error("Telegram could not download that file");
  return new Uint8Array(await response.arrayBuffer());
}

function failureMessage(reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : "unknown problem";
  if (detail === "ai not configured") return "AI summaries aren't set up yet. Ask the bot owner to add the OpenAI key, then send the file again.";
  if (detail === "no readable text") return "I couldn't find readable text in that file. Try a clearer scan or a text-based PDF.";
  if (detail === "AI is busy") return "The summary service is busy right now. Wait a moment, then send the file again.";
  if (detail.includes("Telegram")) return "I couldn't read that file from Telegram. Try uploading it again as a PDF, image, or text file.";
  return "I couldn't extract a summary from that file. Try a clearer image, a text-based PDF, or a .txt file.";
}

async function notifyRepeatedFailure(ctx: Ctx, state: StudyState): Promise<void> {
  const failures = state.jobs.filter((job) => job.status === "failed").length;
  if (!state.adminAlerts || failures < state.failureThreshold || !ctx.chat) return;
  try {
    await ctx.api.sendMessage(ctx.chat.id, "Admin alert: this account has had repeated file-processing failures.");
  } catch {
    // A blocked bot must never prevent the original failure response.
  }
}

export async function processUpload(ctx: Ctx, file: { fileId: string; name: string; size: number; mime: string }): Promise<void> {
  const state = stateFor(ctx);
  if (!supported(file.name, file.mime)) {
    await ctx.reply("That file type isn't supported. Send a PDF, image, DOCX, or .txt study file.");
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    await ctx.reply("That file is too large to read here. Keep it under 20 MB and try again.");
    return;
  }
  const job: StudyJob = { status: "processing", retryCount: 0, createdAt: now() };
  state.jobs.push(job);
  await ctx.reply("Received — summarizing now");
  try {
    const bytes = await download(ctx, file.fileId);
    const document: StudyDocument = { fileId: file.fileId, name: file.name, size: file.size, type: file.mime, uploadTime: now() };
    const textLike = file.mime.startsWith("text/") || file.name.toLowerCase().endsWith(".txt");
    const text = textLike ? new TextDecoder().decode(bytes) : undefined;
    const summary = apiKey()
      ? await openAiSummary({ text, bytes: text ? undefined : bytes, mime: file.mime, name: file.name }, "standard")
      : text ? extractiveSummary(text, 4) : await openAiSummary({ bytes, mime: file.mime, name: file.name }, "standard");
    const record: StudySummary = { content: summary, lengthVersion: "standard", generationTime: now(), sourceDocument: document };
    state.documents.push(document);
    state.documents = state.documents.slice(-20);
    state.lastSummary = record;
    job.status = "completed";
    await ctx.reply(summary, { reply_markup: adjustmentKeyboard() });
  } catch (error) {
    job.status = "failed";
    job.errorDetails = error instanceof Error ? error.message : "unknown extraction failure";
    job.retryCount += 1;
    await notifyRepeatedFailure(ctx, state);
    await ctx.reply(failureMessage(error));
  }
}

export async function adjustSummary(ctx: Ctx, version: Exclude<SummaryLength, "standard">): Promise<void> {
  const state = stateFor(ctx);
  const previous = state.lastSummary;
  if (!previous) {
    await ctx.editMessageText("No summary yet — send a study file first.", { reply_markup: adjustmentKeyboard() });
    return;
  }
  try {
    const target = version === "expanded" ? 8 : version === "shortened" ? 2 : 4;
    const content = apiKey()
      ? await openAiSummary({ text: previous.content }, version)
      : extractiveSummary(previous.content, target);
    state.lastSummary = { ...previous, content, lengthVersion: version, generationTime: now() };
    await ctx.editMessageText(content, { reply_markup: adjustmentKeyboard() });
  } catch {
    await ctx.editMessageText("I couldn't adjust that summary just now. Try again in a moment.", { reply_markup: adjustmentKeyboard() });
  }
}

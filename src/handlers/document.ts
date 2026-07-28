import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { processUpload, stateFor } from "../study.js";

registerMainMenuItem({ label: "📄 Summarize material", data: "document:upload", order: 10 });

const composer = new Composer<Ctx>();

composer.callbackQuery("document:upload", async (ctx) => {
  stateFor(ctx);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Send a PDF, image, DOCX, or .txt study file and I'll make a concise summary.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Menu", "menu:main")]]),
  });
});

composer.on("message:document", async (ctx) => {
  const doc = ctx.message.document;
  await processUpload(ctx, { fileId: doc.file_id, name: doc.file_name ?? "study file", size: doc.file_size ?? 0, mime: doc.mime_type ?? "application/octet-stream" });
});

composer.on("message:photo", async (ctx) => {
  const photo = ctx.message.photo.at(-1);
  if (!photo) return;
  await processUpload(ctx, { fileId: photo.file_id, name: "study image.jpg", size: photo.file_size ?? 0, mime: "image/jpeg" });
});

composer.on("message:video", async (ctx) => {
  await ctx.reply("Videos aren't supported. Send a PDF, image, DOCX, or .txt study file instead.");
});

export default composer;

import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adjustSummary } from "../study.js";

const composer = new Composer<Ctx>();
composer.callbackQuery("summary:shorten", async (ctx) => {
  await ctx.answerCallbackQuery();
  await adjustSummary(ctx, "shortened");
});

export default composer;

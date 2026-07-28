import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adjustSummary } from "../study.js";

const composer = new Composer<Ctx>();
composer.callbackQuery("summary:expand", async (ctx) => {
  await ctx.answerCallbackQuery();
  await adjustSummary(ctx, "expanded");
});

export default composer;

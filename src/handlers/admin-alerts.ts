import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { stateFor } from "../study.js";

registerMainMenuItem({ label: "Admin alerts", data: "admin:alerts", order: 30 });

const composer = new Composer<Ctx>();

function settingsText(enabled: boolean, threshold: number): string {
  return enabled
    ? `Admin failure alerts are on. You'll be notified after ${threshold} failed uploads from this account.`
    : `Admin failure alerts are off. Turn them on to get a notice after repeated failed uploads from this account.`;
}

function settingsKeyboard(enabled: boolean, threshold: number) {
  return inlineKeyboard([
    [inlineButton(enabled ? "Turn alerts off" : "Turn alerts on", "admin:toggle")],
    [inlineButton(`Alert after ${threshold === 3 ? 5 : 3} failures`, "admin:threshold")],
    [inlineButton("⬅️ Menu", "menu:main")],
  ]);
}

async function show(ctx: Ctx): Promise<void> {
  const state = stateFor(ctx);
  await ctx.editMessageText(settingsText(state.adminAlerts, state.failureThreshold), {
    reply_markup: settingsKeyboard(state.adminAlerts, state.failureThreshold),
  });
}

composer.callbackQuery("admin:alerts", async (ctx) => {
  await ctx.answerCallbackQuery();
  await show(ctx);
});

composer.callbackQuery("admin:toggle", async (ctx) => {
  await ctx.answerCallbackQuery();
  const state = stateFor(ctx);
  state.adminAlerts = !state.adminAlerts;
  await show(ctx);
});

composer.callbackQuery("admin:threshold", async (ctx) => {
  await ctx.answerCallbackQuery();
  const state = stateFor(ctx);
  state.failureThreshold = state.failureThreshold === 3 ? 5 : 3;
  await show(ctx);
});

export default composer;

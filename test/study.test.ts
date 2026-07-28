import { afterEach, describe, expect, it, vi } from "vitest";
import { adjustSummary, processUpload, type StudyState } from "../src/study";

function fakeContext() {
  const replies: string[] = [];
  const edits: string[] = [];
  const ctx = {
    from: { id: 7 },
    chat: { id: 7, type: "private" },
    session: {} as { study?: StudyState },
    api: {
      getFile: vi.fn(async () => ({ file_path: "uploads/notes.txt" })),
      sendMessage: vi.fn(async () => true),
    },
    reply: vi.fn(async (text: string) => {
      replies.push(text);
      return true;
    }),
    editMessageText: vi.fn(async (text: string) => {
      edits.push(text);
      return true;
    }),
  };
  return { ctx, replies, edits };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("study processing", () => {
  it("summarizes an uploaded text file, then adjusts the saved summary", async () => {
    const { ctx, replies, edits } = fakeContext();
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("BOT_TOKEN", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("First idea is clear. Second idea adds evidence. Third idea explains the conclusion. Fourth idea gives the next step.")),
    );

    await processUpload(ctx as never, { fileId: "file-1", name: "notes.txt", size: 120, mime: "text/plain" });

    expect(replies[0]).toBe("Received — summarizing now");
    expect(ctx.session.study?.lastSummary?.content).toContain("First idea is clear.");
    expect(ctx.session.study?.jobs[0]?.status).toBe("completed");

    await adjustSummary(ctx as never, "shortened");
    expect(edits[0]).toContain("First idea is clear.");
    expect(ctx.session.study?.lastSummary?.lengthVersion).toBe("shortened");
  });
});

/**
 * PagePilot video/Reels adapter tests — Phase 6.
 * Run against MockVideoTransport: no network, no Meta API.
 */
import { describe, expect, it } from "vitest";
import {
  MemoryJobStore,
  MockVideoTransport,
  VideoMetaClient,
  createPostWithTargets,
  runSchedulerTick,
  type ProgressCallback,
  type PublishInput,
} from "./core";

const USER = "user-1";
const FUTURE = new Date(Date.now() + 3600_000).toISOString();
const FILE_SIZE = 20 * 1024 * 1024; // 20 MB → 3 chunks of 8 MB

function videoInput(kind: "video" | "reel" = "video"): PublishInput {
  return { pageId: "page9", caption: "Demo video", kind, idempotencyKey: "pp:post1:page9" };
}

describe("VideoMetaClient with MockVideoTransport", () => {
  it("uploads in chunks, polls processing, then publishes — with monotonic progress", async () => {
    const transport = new MockVideoTransport("ok");
    const seen: number[] = [];
    const onProgress: ProgressCallback = (f) => seen.push(f);
    const client = new VideoMetaClient(transport, { fileSizeBytes: FILE_SIZE, onProgress, noWait: true });
    const res = await client.publish(videoInput(), "tok");
    expect(res.ok).toBe(true);
    expect(res.remoteId).toMatch(/^post_vid-sess-page9$/);
    // Phase order: start → chunks → finish → polls → publishVideo
    expect(transport.calls[0]).toBe("start:page9");
    expect(transport.calls).toContain("finish:sess-page9");
    expect(transport.calls).toContain("publishVideo:page9");
    expect(transport.publishedAs).toEqual(["video"]);
    // Progress never decreases and reaches 1.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen[seen.length - 1]).toBe(1);
    // 20 MB / 8 MB chunks = 3 chunk calls.
    expect(transport.calls.filter((c) => c.startsWith("chunk:")).length).toBe(3);
  });

  it("publishes reels through the Reels endpoint, not the video endpoint", async () => {
    const transport = new MockVideoTransport("ok");
    const client = new VideoMetaClient(transport, { fileSizeBytes: FILE_SIZE, noWait: true });
    const res = await client.publish(videoInput("reel"), "tok");
    expect(res.ok).toBe(true);
    expect(res.remoteId).toMatch(/^reel_vid-/);
    expect(transport.publishedAs).toEqual(["reel"]);
    expect(transport.calls).not.toContain("publishVideo:page9");
  });

  it("reports processing failure as non-retryable", async () => {
    const transport = new MockVideoTransport("processing-fails");
    const client = new VideoMetaClient(transport, { fileSizeBytes: FILE_SIZE, noWait: true });
    const res = await client.publish(videoInput(), "tok");
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("video_processing_failed");
    expect(res.retryable).toBe(false);
  });

  it("reports mid-upload failure as retryable", async () => {
    const transport = new MockVideoTransport("upload-fails");
    const client = new VideoMetaClient(transport, { fileSizeBytes: FILE_SIZE, noWait: true });
    const res = await client.publish(videoInput(), "tok");
    expect(res.ok).toBe(false);
    expect(res.retryable).toBe(true);
  });

  it("times out when processing never becomes ready", async () => {
    const transport = new MockVideoTransport("processing-timeout");
    const client = new VideoMetaClient(transport, { fileSizeBytes: FILE_SIZE, noWait: true, maxProcessingPolls: 3 });
    const res = await client.publish(videoInput(), "tok");
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("timeout");
    expect(res.retryable).toBe(true);
  });

  it("refuses non-video kinds", async () => {
    const transport = new MockVideoTransport("ok");
    const client = new VideoMetaClient(transport, { fileSizeBytes: FILE_SIZE, noWait: true });
    const res = await client.publish({ pageId: "p", caption: "x", kind: "text", idempotencyKey: "k" }, "tok");
    expect(res.ok).toBe(false);
  });
});

describe("scheduler routes video posts through the video adapter", () => {
  it("publishes a video post end-to-end via the mock transport", async () => {
    const store = new MemoryJobStore();
    const { post } = await createPostWithTargets(store, {
      userId: USER,
      caption: "Demo video post",
      mediaAssetId: "asset-1",
      kind: "video",
      pageIds: ["conn-1"],
      metaPageIds: ["page9"],
      scheduledAtUtc: FUTURE,
      timezone: "Asia/Karachi",
      publishNow: false,
    });
    const transport = new MockVideoTransport("ok");
    const videoClient = new VideoMetaClient(transport, { fileSizeBytes: FILE_SIZE, noWait: true });
    const tick = await runSchedulerTick({
      store,
      client: videoClient,
      getPageToken: async () => "tok",
      workerId: "w",
      now: () => new Date(FUTURE).getTime() + 1000,
    });
    expect(tick.published).toBe(1);
    expect((await store.getPost(post.id))?.overall_status).toBe("published");
  });
});

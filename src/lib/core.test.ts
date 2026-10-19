/**
 * PagePilot unit tests — Phase 4/5/6 engine.
 * These run against MemoryJobStore + MockMetaClient: NO real Supabase, NO real
 * Meta API, NO network. Every test below was executed with `npx vitest run`.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_ATTEMPTS,
  MemoryJobStore,
  MockMetaClient,
  backoffDelayMs,
  classifyFailure,
  createPostWithTargets,
  formatInTimeZone,
  isOAuthStateUsable,
  missingScopes,
  rollupStatus,
  runSchedulerTick,
  sanitizeErrorText,
  validateMediaFile,
  zonedTimeToUtc,
  type JobStore,
} from "./core";

const USER = "user-1";
const FUTURE = new Date(Date.now() + 3600_000).toISOString();

function pages(n: number): { ids: string[]; meta: string[] } {
  const ids = Array.from({ length: n }, (_, i) => `conn-${i + 1}`);
  const meta = Array.from({ length: n }, (_, i) => `page${i + 1}`);
  return { ids, meta };
}

async function makePost(store: JobStore, n = 1, extra: Record<string, unknown> = {}) {
  const { ids, meta } = pages(n);
  return createPostWithTargets(store, {
    userId: USER,
    caption: "Hello world",
    kind: "text",
    pageIds: ids,
    metaPageIds: meta,
    scheduledAtUtc: FUTURE,
    timezone: "Asia/Karachi",
    publishNow: false,
    ...extra,
  });
}

describe("createPostWithTargets", () => {
  it("creates one target + one job per page with stable idempotency keys", async () => {
    const store = new MemoryJobStore();
    const { post, targets } = await makePost(store, 3);
    expect(targets).toHaveLength(3);
    expect(post.overall_status).toBe("scheduled");
    const keys = [...store.jobs.values()].map((j) => j.idempotency_key).sort();
    expect(keys).toEqual(["pp:" + post.id + ":page1", "pp:" + post.id + ":page2", "pp:" + post.id + ":page3"].sort());
  });

  it("rejects empty caption without media", async () => {
    const store = new MemoryJobStore();
    await expect(makePost(store, 1, { caption: "   " })).rejects.toThrow(/caption/);
  });

  it("rejects zero pages", async () => {
    const store = new MemoryJobStore();
    await expect(
      createPostWithTargets(store, {
        userId: USER, caption: "x", kind: "text", pageIds: [], metaPageIds: [],
        scheduledAtUtc: FUTURE, timezone: "Asia/Karachi", publishNow: false,
      }),
    ).rejects.toThrow(/at least one Page/);
  });

  it("rejects a schedule in the past", async () => {
    const store = new MemoryJobStore();
    await expect(
      makePost(store, 1, { scheduledAtUtc: new Date(Date.now() - 1000).toISOString() }),
    ).rejects.toThrow(/future/);
  });

  it("deduplicates repeated page ids", async () => {    const store = new MemoryJobStore();
    const { targets } = await createPostWithTargets(store, {
      userId: USER, caption: "x", kind: "text",
      pageIds: ["conn-1", "conn-1"], metaPageIds: ["page1", "page1"],
      scheduledAtUtc: FUTURE, timezone: "Asia/Karachi", publishNow: false,
    });
    expect(targets).toHaveLength(1);
  });

  it("saves a draft with targets but no jobs", async () => {
    const store = new MemoryJobStore();
    const { ids, meta } = pages(2);
    const { post, targets } = await createPostWithTargets(store, {
      userId: USER,
      caption: "Draft post",
      kind: "text",
      pageIds: ids,
      metaPageIds: meta,
      scheduledAtUtc: null,
      timezone: "Asia/Karachi",
      publishNow: false,
      draft: true,
    });
    expect(post.overall_status).toBe("draft");
    expect(targets).toHaveLength(2);
    expect(store.jobs.size).toBe(0);
  });
});

describe("idempotency / duplicate prevention", () => {
  it("refuses a second job with the same idempotency key", async () => {
    const store = new MemoryJobStore();
    const { targets } = await makePost(store, 1);
    await expect(
      store.createJob({
        post_target_id: targets[0].id, run_at_utc: FUTURE, status: "scheduled", idempotency_key: `pp:dup:page1`,
      }),
    ).resolves.toBeDefined();
    await expect(
      store.createJob({
        post_target_id: targets[0].id, run_at_utc: FUTURE, status: "scheduled", idempotency_key: `pp:dup:page1`,
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_IDEMPOTENCY_KEY" });
  });

  it("a second claim on the same tick finds nothing (atomic claim)", async () => {
    const store = new MemoryJobStore();
    await makePost(store, 2);
    const now = new Date(FUTURE).toISOString();
    const first = await store.claimDueJobs(10, "w1", now);
    expect(first).toHaveLength(2);
    const second = await store.claimDueJobs(10, "w2", now);
    expect(second).toHaveLength(0); // already locked by w1
  });
});

describe("scheduler: partial success across pages", () => {
  it("reports per-target outcomes truthfully and rolls up partially_failed", async () => {
    const store = new MemoryJobStore();
    const { post } = await makePost(store, 3);
    const mock = new MockMetaClient({ page1: "ok", page2: "revoked", page3: "validation-error" });
    const tick = await runSchedulerTick({
      store, client: mock,
      getPageToken: async () => "mock-token",
      workerId: "test",
      now: () => new Date(FUTURE).getTime() + 1000,
    });
    expect(tick.claimed).toBe(3);
    expect(tick.published).toBe(1);
    expect(tick.needsReauth).toBe(1);
    expect(tick.failed).toBe(1);
    const updated = await store.getPost(post.id);
    expect(updated?.overall_status).toBe("partially_failed");
    const targets = await store.listTargetsForPost(post.id);
    const byPage = Object.fromEntries(targets.map((t) => [t.meta_page_id, t.target_status]));
    expect(byPage).toEqual({ page1: "published", page2: "needs_reauthorization", page3: "failed" });
  });

  it("does not retry revoked tokens (no blind retry)", async () => {
    const store = new MemoryJobStore();
    await makePost(store, 1);
    const mock = new MockMetaClient({ page1: "revoked" });
    await runSchedulerTick({ store, client: mock, getPageToken: async () => "t", workerId: "w", now: () => new Date(FUTURE).getTime() + 1 });
    const jobs = [...store.jobs.values()];
    expect(jobs[0].status).toBe("needs_reauthorization");
    expect(mock.callCount("page1")).toBe(1);
    // A later tick must not pick it up again.
    const tick2 = await runSchedulerTick({ store, client: mock, getPageToken: async () => "t", workerId: "w", now: () => Date.now() + 10 ** 9 });
    expect(tick2.claimed).toBe(0);
    expect(mock.callCount("page1")).toBe(1);
  });
});

describe("scheduler: retry with backoff, then dead-letter", () => {
  it("retries a rate-limited job after the backoff delay, then publishes", async () => {
    const store = new MemoryJobStore();
    await makePost(store, 1);
    const mock = new MockMetaClient({ page1: "rate-limit-once" });
    const t0 = new Date(FUTURE).getTime() + 1000;
    const tick1 = await runSchedulerTick({ store, client: mock, getPageToken: async () => "t", workerId: "w", now: () => t0 });
    expect(tick1.retried).toBe(1);
    const job = [...store.jobs.values()][0];
    expect(job.status).toBe("scheduled");
    expect(new Date(job.next_attempt_at as string).getTime()).toBe(t0 + backoffDelayMs(1));
    // Too early: nothing due.
    const tickEarly = await runSchedulerTick({ store, client: mock, getPageToken: async () => "t", workerId: "w", now: () => t0 + 1000 });
    expect(tickEarly.claimed).toBe(0);
    // After the delay: publishes.
    const tick2 = await runSchedulerTick({ store, client: mock, getPageToken: async () => "t", workerId: "w", now: () => t0 + backoffDelayMs(1) + 1000 });
    expect(tick2.published).toBe(1);
  });

  it("dead-letters a persistently rate-limited job after MAX_ATTEMPTS", async () => {
    const store = new MemoryJobStore();
    await makePost(store, 1);
    const mock = new MockMetaClient({ page1: "rate-limit-always" });
    let now = new Date(FUTURE).getTime() + 1000;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const tick = await runSchedulerTick({ store, client: mock, getPageToken: async () => "t", workerId: "w", now: () => now });
      now += 4 * 3600_000; // jump past any backoff
      if (i < MAX_ATTEMPTS - 1) expect(tick.retried).toBe(1);
    }
    const job = [...store.jobs.values()][0];
    expect(job.status).toBe("dead");
    expect(job.attempt_count).toBe(MAX_ATTEMPTS);
  });
});

describe("scheduler: reconcile-before-retry (no duplicate posts)", () => {
  it("recovers a timed-out publish via findExisting instead of re-posting", async () => {
    const store = new MemoryJobStore();
    await makePost(store, 1);
    const mock = new MockMetaClient({ page1: "timeout-once" });
    const tick = await runSchedulerTick({
      store, client: mock, getPageToken: async () => "t", workerId: "w", now: () => new Date(FUTURE).getTime() + 1000,
    });
    expect(tick.published).toBe(1);
    expect(tick.retried).toBe(0);
    expect(mock.callCount("page1")).toBe(1); // exactly one publish attempt — no duplicate
    const attempts = await store.listAttempts([...store.jobs.values()][0].id);
    expect(attempts[0].outcome).toBe("skipped_duplicate");
    const target = (await store.listTargetsForPost([...store.posts.values()][0].id))[0];
    expect(target.target_status).toBe("published");
    expect(target.remote_post_id).toMatch(/^mock_page1_/);
  });
});

describe("failure classification", () => {
  it("190 → needs_reauthorization, not retryable", () => {
    expect(classifyFailure("190")).toEqual({ outcome: "needs_reauthorization", retryable: false });
  });
  it("4 → rate_limited, retryable", () => {
    expect(classifyFailure("4")).toEqual({ outcome: "rate_limited", retryable: true });
  });
  it("100 → failed, not retryable", () => {
    expect(classifyFailure("100")).toEqual({ outcome: "failed", retryable: false });
  });
  it("backoff grows exponentially and caps at 1 hour", () => {
    expect(backoffDelayMs(1)).toBe(120_000);
    expect(backoffDelayMs(2)).toBe(240_000);
    expect(backoffDelayMs(10)).toBe(3_600_000);
  });
});

describe("rollupStatus", () => {
  it("all published → published", () => {
    expect(rollupStatus([{ target_status: "published" }, { target_status: "published" }])).toBe("published");
  });
  it("mixed → partially_failed", () => {
    expect(rollupStatus([{ target_status: "published" }, { target_status: "failed" }])).toBe("partially_failed");
  });
  it("all failed → failed", () => {
    expect(rollupStatus([{ target_status: "failed" }])).toBe("failed");
  });
});

describe("timezone helpers", () => {
  it("converts Asia/Karachi wall time to UTC (UTC+5)", () => {
    expect(zonedTimeToUtc("2026-10-19T18:30", "Asia/Karachi")).toBe("2026-10-19T13:30:00.000Z");
  });
  it("converts America/New_York wall time to UTC (EDT, UTC-4)", () => {
    expect(zonedTimeToUtc("2026-10-19T18:30", "America/New_York")).toBe("2026-10-19T22:30:00.000Z");
  });
  it("rejects malformed input", () => {
    expect(() => zonedTimeToUtc("tomorrow-ish", "Asia/Karachi")).toThrow(/Invalid datetime/);
  });
  it("formats UTC for display in the user timezone", () => {
    const s = formatInTimeZone("2026-10-19T13:30:00.000Z", "Asia/Karachi");
    expect(s).toContain("18:30");
  });
});

describe("OAuth state validation", () => {
  const NOW = Date.now();
  it("accepts a fresh unused state", () => {
    expect(isOAuthStateUsable({ expires_at: new Date(NOW + 60_000).toISOString(), used_at: null }, NOW).ok).toBe(true);
  });
  it("rejects an expired state", () => {
    expect(isOAuthStateUsable({ expires_at: new Date(NOW - 1000).toISOString(), used_at: null }, NOW))
      .toMatchObject({ ok: false, reason: "OAuth state expired" });
  });
  it("rejects a reused state", () => {
    expect(isOAuthStateUsable({ expires_at: new Date(NOW + 60_000).toISOString(), used_at: new Date(NOW).toISOString() }, NOW))
      .toMatchObject({ ok: false, reason: "OAuth state already used" });
  });
  it("rejects an unknown state", () => {
    expect(isOAuthStateUsable(null, NOW)).toMatchObject({ ok: false, reason: "Unknown OAuth state" });
  });
});

describe("token scope checks", () => {
  it("reports missing required scopes", () => {
    expect(missingScopes(["pages_show_list"])).toEqual(["pages_manage_posts", "pages_read_engagement"]);
  });
  it("passes when all scopes are granted", () => {
    expect(missingScopes(["pages_manage_posts", "pages_read_engagement", "pages_show_list"])).toEqual([]);
  });
});

describe("media validation", () => {
  it("accepts a normal jpeg", () => {
    expect(validateMediaFile({ name: "a.jpg", size: 500_000, mime: "image/jpeg" })).toMatchObject({ ok: true, kind: "image" });
  });
  it("rejects an oversized image", () => {
    expect(validateMediaFile({ name: "big.png", size: 20 * 1024 * 1024, mime: "image/png" }).ok).toBe(false);
  });
  it("rejects an executable disguised as media", () => {
    expect(validateMediaFile({ name: "evil.exe", size: 1000, mime: "application/x-msdownload" }).ok).toBe(false);
  });
  it("accepts a small mp4", () => {
    expect(validateMediaFile({ name: "clip.mp4", size: 50 * 1024 * 1024, mime: "video/mp4" })).toMatchObject({ ok: true, kind: "video" });
  });
  it("rejects a video over the direct-upload cap", () => {
    expect(validateMediaFile({ name: "huge.mp4", size: 2 * 1024 * 1024 * 1024, mime: "video/mp4" }).ok).toBe(false);
  });
});

describe("error sanitization", () => {
  it("redacts tokens and secrets from messages", () => {
    const s = sanitizeErrorText("failed with EAABxyz123 and access_token=EAABabc and secret 0123456789abcdef0123456789abcdef");
    expect(s).not.toContain("EAABxyz123");
    expect(s).not.toContain("0123456789abcdef0123456789abcdef");
    expect(s).toContain("[TOKEN]");
  });
});

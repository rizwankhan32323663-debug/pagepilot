// MockMetaClient — deterministic stand-in for the Meta Graph API.
// Lets the scheduler, publishing engine, and UI be tested WITHOUT publishing
// anything real. Behaviors are scripted per Page id. Zero runtime imports.
import type { MetaClient, PublishInput, PublishResult, TokenValidation } from "./core.ts";

export type MockBehavior =
  | "ok" // publish succeeds
  | "revoked" // 190: token dead → needs_reauthorization, never retried
  | "rate-limit-once" // 4: fails once, then succeeds (tests backoff/retry)
  | "rate-limit-always" // 4: always (tests dead-letter after MAX_ATTEMPTS)
  | "timeout-once" // throws once AFTER recording the post (tests reconcile)
  | "validation-error"; // 100: permanent failure, not retried

export class MockMetaClient implements MetaClient {
  private behaviors: Record<string, MockBehavior>;
  private calls = new Map<string, number>();
  /** Every input the mock "received", in order — assert on this in tests. */
  readonly received: PublishInput[] = [];
  /** Posts the mock recorded as published (for reconcile). */
  private recorded = new Map<string, string>();
  private seq = 0;

  constructor(behaviors: Record<string, MockBehavior> = {}) {
    this.behaviors = behaviors;
  }

  private behaviorFor(pageId: string): MockBehavior {
    return this.behaviors[pageId] ?? "ok";
  }

  async publish(input: PublishInput, _pageToken: string): Promise<PublishResult> {
    this.received.push(input);
    const n = (this.calls.get(input.pageId) ?? 0) + 1;
    this.calls.set(input.pageId, n);
    const b = this.behaviorFor(input.pageId);
    const remoteId = `mock_${input.pageId}_${++this.seq}`;

    switch (b) {
      case "ok":
        this.recorded.set(input.idempotencyKey, remoteId);
        return { ok: true, remoteId, remoteUrl: `https://facebook.com/mock/${remoteId}` };
      case "revoked":
        return { ok: false, errorCode: "190", errorMessage: "Invalid OAuth access token (mock)", retryable: false };
      case "rate-limit-once":
        if (n === 1) return { ok: false, errorCode: "4", errorMessage: "Application request limit reached (mock)", retryable: true };
        this.recorded.set(input.idempotencyKey, remoteId);
        return { ok: true, remoteId, remoteUrl: `https://facebook.com/mock/${remoteId}` };
      case "rate-limit-always":
        return { ok: false, errorCode: "4", errorMessage: "Application request limit reached (mock)", retryable: true };
      case "timeout-once":
        if (n === 1) {
          // The post DID land, but the response was lost — reconcile must find it.
          this.recorded.set(input.idempotencyKey, remoteId);
          throw new Error("network timeout (mock)");
        }
        this.recorded.set(input.idempotencyKey, remoteId);
        return { ok: true, remoteId, remoteUrl: `https://facebook.com/mock/${remoteId}` };
      case "validation-error":
        return { ok: false, errorCode: "100", errorMessage: "Invalid parameter (mock)", retryable: false };
    }
  }

  async findExisting(input: PublishInput, _pageToken: string): Promise<string | null> {
    return this.recorded.get(input.idempotencyKey) ?? null;
  }

  async validateToken(_token: string): Promise<TokenValidation> {
    return { valid: true, pageId: "mock_page", pageName: "Mock Page", scopes: ["pages_manage_posts"] };
  }

  callCount(pageId: string): number {
    return this.calls.get(pageId) ?? 0;
  }
}

// Video & Reels publishing adapters — Phase 6.
// Separate, testable adapters per content type (per spec). The resumable
// upload is split into a TRANSPORT interface so the orchestration logic is
// fully unit-tested against MockVideoTransport with zero network.
//
// LIVE TRANSPORT HONESTY: MetaVideoTransport implements Meta's documented
// resumable upload flow (see links below), but it has NEVER run against the
// real API in this environment — no Meta app, no credentials. Treat it as
// code-complete / not live-tested. Verify parameter names against the CURRENT
// Meta docs before first live use:
//   https://developers.facebook.com/docs/video-api/guides/publishing
//   https://developers.facebook.com/docs/video-api/guides/reels-publishing
//
// Zero runtime imports (Deno fetch is a global).

import type { MetaClient, PublishInput, PublishResult } from "./core.ts";
import { sanitizeErrorText } from "./core.ts";

/** Progress callback: 0..1 fraction uploaded. */
export type ProgressCallback = (fraction: number, phase: "upload" | "processing" | "publish") => void;

export interface VideoTransport {
  startSession(pageId: string, fileSizeBytes: number, token: string): Promise<{ sessionId: string }>;
  uploadChunk(sessionId: string, offset: number, chunk: Uint8Array, token: string): Promise<{ nextOffset: number }>;
  finishSession(sessionId: string, token: string): Promise<{ videoId: string }>;
  /** Poll until "ready" | "error". Implementations may take several polls. */
  processingStatus(videoId: string, token: string): Promise<"processing" | "ready" | "error">;
  publishAsVideo(pageId: string, videoId: string, caption: string, token: string): Promise<{ remoteId: string }>;
  publishAsReel(pageId: string, videoId: string, caption: string, token: string): Promise<{ remoteId: string }>;
}

export interface VideoAdapterOpts {
  fileSizeBytes: number;
  maxProcessingPolls?: number;
  processingPollIntervalMs?: number;
  onProgress?: ProgressCallback;
  /** Test hook: bypass real waiting between processing polls. */
  noWait?: boolean;
}

const DEFAULT_CHUNK = 8 * 1024 * 1024; // 8 MB chunks

/**
 * MetaClient-compatible wrapper: runs the full resumable flow (session →
 * chunks → finish → poll → publish) inside one publish() call so the
 * existing scheduler works unchanged. Video and Reel differ only in the
 * final publish step.
 */
export class VideoMetaClient implements MetaClient {
  private transport: VideoTransport;
  private opts: VideoAdapterOpts;

  constructor(transport: VideoTransport, opts: VideoAdapterOpts) {
    this.transport = transport;
    this.opts = opts;
  }

  async publish(input: PublishInput, pageToken: string): Promise<PublishResult> {
    const progress = this.opts.onProgress ?? (() => {});
    const maxPolls = this.opts.maxProcessingPolls ?? 30;
    try {
      if (input.kind !== "video" && input.kind !== "reel") {
        return { ok: false, errorCode: "100", errorMessage: "VideoMetaClient handles video/reel only.", retryable: false };
      }
      const { sessionId } = await this.transport.startSession(input.pageId, this.opts.fileSizeBytes, pageToken);

      // NOTE: chunk bytes are the transport's concern (it also decides chunk
      // sizing). The mock simulates them; the live transport streams the
      // actual file (Phase 7 wires real bytes).
      let offset = 0;
      const empty = new Uint8Array(0);
      while (offset < this.opts.fileSizeBytes) {
        const res = await this.transport.uploadChunk(sessionId, offset, empty, pageToken);
        if (res.nextOffset <= offset) throw new Error("Upload stalled: server returned no progress");
        offset = res.nextOffset;
        progress(Math.min(offset / this.opts.fileSizeBytes, 1), "upload");
      }

      const { videoId } = await this.transport.finishSession(sessionId, pageToken);

      let status: "processing" | "ready" | "error" = "processing";
      for (let i = 0; i < maxPolls; i++) {
        status = await this.transport.processingStatus(videoId, pageToken);
        progress(1, "processing");
        if (status !== "processing") break;
        if (!this.opts.noWait) await new Promise((r) => setTimeout(r, this.opts.processingPollIntervalMs ?? 5000));
      }
      if (status === "error") {
        return { ok: false, errorCode: "video_processing_failed", errorMessage: "Meta failed to process the video.", retryable: false };
      }
      if (status !== "ready") {
        return { ok: false, errorCode: "timeout", errorMessage: "Timed out waiting for video processing.", retryable: true };
      }

      progress(1, "publish");
      const pub =
        input.kind === "reel"
          ? await this.transport.publishAsReel(input.pageId, videoId, input.caption, pageToken)
          : await this.transport.publishAsVideo(input.pageId, videoId, input.caption, pageToken);
      return { ok: true, remoteId: pub.remoteId, remoteUrl: `https://www.facebook.com/${pub.remoteId}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retryable = /timeout|network|rate|5\d\d/i.test(msg);
      return { ok: false, errorCode: retryable ? "timeout" : "100", errorMessage: sanitizeErrorText(msg), retryable };
    }
  }
}

export type MockVideoBehavior = "ok" | "processing-fails" | "upload-fails" | "processing-timeout";

/** Deterministic transport for tests: simulates chunked upload + processing. */
export class MockVideoTransport implements VideoTransport {
  private behavior: MockVideoBehavior;
  readonly calls: string[] = [];
  readonly publishedAs: Array<"video" | "reel"> = [];
  private polls = 0;

  constructor(behavior: MockVideoBehavior = "ok") {
    this.behavior = behavior;
  }

  async startSession(pageId: string, _fileSize: number, _token: string) {
    this.calls.push(`start:${pageId}`);
    return { sessionId: `sess-${pageId}` };
  }
  async uploadChunk(_sessionId: string, offset: number, _chunk: Uint8Array, _token: string) {
    this.calls.push(`chunk:${offset}`);
    if (this.behavior === "upload-fails" && offset > 0) throw new Error("network timeout (mock)");
    // Simulate 8 MB chunks regardless of the empty buffer.
    return { nextOffset: offset + DEFAULT_CHUNK };
  }
  async finishSession(sessionId: string, _token: string) {
    this.calls.push(`finish:${sessionId}`);
    return { videoId: `vid-${sessionId}` };
  }
  async processingStatus(_videoId: string, _token: string) {
    this.polls++;
    this.calls.push(`poll:${this.polls}`);
    if (this.behavior === "processing-fails") return "error" as const;
    if (this.behavior === "processing-timeout") return "processing" as const;
    return (this.polls >= 2 ? "ready" : "processing") as "processing" | "ready" | "error";
  }
  async publishAsVideo(pageId: string, videoId: string, _caption: string, _token: string) {
    this.calls.push(`publishVideo:${pageId}`);
    this.publishedAs.push("video");
    return { remoteId: `post_${videoId}` };
  }
  async publishAsReel(pageId: string, videoId: string, _caption: string, _token: string) {
    this.calls.push(`publishReel:${pageId}`);
    this.publishedAs.push("reel");
    return { remoteId: `reel_${videoId}` };
  }
}

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Live transport — implements Meta's resumable upload flow. NOT live-tested.
 * fileBytesProvider supplies each chunk's bytes (Phase 7 wires real storage).
 */
export class MetaVideoTransport implements VideoTransport {
  private fileBytesProvider: (offset: number, length: number) => Promise<Uint8Array>;

  constructor(fileBytesProvider: (offset: number, length: number) => Promise<Uint8Array>) {
    this.fileBytesProvider = fileBytesProvider;
  }

  private async call(path: string, token: string, params: Record<string, string>, body?: Uint8Array): Promise<Record<string, unknown>> {
    const qs = new URLSearchParams({ access_token: token, ...params });
    const res = await fetch(`${GRAPH}${path}?${qs}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/octet-stream" } : undefined,
      body: body as BodyInit | undefined,
    });
    const data = (await res.json()) as { error?: { message?: string; code?: number } } & Record<string, unknown>;
    if (!res.ok || data.error) {
      throw new Error(
        sanitizeErrorText(`Meta video API error${data.error?.code ? ` (${data.error.code})` : ""}: ${data.error?.message ?? res.statusText}`),
      );
    }
    return data;
  }

  async startSession(pageId: string, fileSizeBytes: number, token: string) {
    const data = await this.call(`/${pageId}/video_uploads`, token, {
      upload_phase: "start",
      file_size: String(fileSizeBytes),
    });
    const sessionId = data["upload_session_id"];
    if (typeof sessionId !== "string") throw new Error("Meta did not return an upload_session_id");
    return { sessionId };
  }

  async uploadChunk(sessionId: string, offset: number, _chunk: Uint8Array, token: string) {
    const bytes = await this.fileBytesProvider(offset, DEFAULT_CHUNK);
    const data = await this.call(`/video_uploads`, token, {
      upload_phase: "transfer",
      upload_session_id: sessionId,
      start_offset: String(offset),
    }, bytes);
    const next = data["start_offset"];
    // Meta echoes the next expected offset as start_offset.
    return { nextOffset: typeof next === "number" ? next : offset + bytes.length };
  }

  async finishSession(sessionId: string, token: string) {
    const data = await this.call(`/video_uploads`, token, {
      upload_phase: "finish",
      upload_session_id: sessionId,
    });
    const videoId = data["video_id"];
    if (typeof videoId !== "string") throw new Error("Meta did not return a video_id on finish");
    return { videoId };
  }

  async processingStatus(videoId: string, token: string) {
    const qs = new URLSearchParams({ access_token: token, fields: "status" });
    const res = await fetch(`${GRAPH}/${videoId}?${qs}`);
    const data = (await res.json()) as { status?: { video_status?: string }; error?: { message?: string } };
    if (data.error) throw new Error(sanitizeErrorText(data.error.message ?? "status check failed"));
    const s = data.status?.video_status;
    if (s === "ready") return "ready" as const;
    if (s === "error") return "error" as const;
    return "processing" as const;
  }

  async publishAsVideo(pageId: string, videoId: string, caption: string, token: string) {
    const data = await this.call(`/${pageId}/videos`, token, { video_id: videoId, description: caption });
    const id = data["post_id"] ?? data["id"];
    if (typeof id !== "string") throw new Error("Meta did not return a post id");
    return { remoteId: id };
  }

  async publishAsReel(pageId: string, videoId: string, caption: string, token: string) {
    const data = await this.call(`/${pageId}/video_reels`, token, {
      video_id: videoId,
      description: caption,
      share_to_feed: "true",
    });
    const id = data["id"];
    if (typeof id !== "string") throw new Error("Meta did not return a reel id");
    return { remoteId: id };
  }
}

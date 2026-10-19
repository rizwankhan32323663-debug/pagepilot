// MetaLiveClient — real Meta Graph API publishing (Deno).
// Scope: text + image posts. Video/Reels are handled by VideoMetaClient
// (see _shared/video.ts), which the publish-worker routes to.
import { GRAPH_BASE, sanitizeErrorText, type MetaClient, type PublishInput, type PublishResult } from "./core.ts";

interface GraphOk {
  id: string;
  post_id?: string;
}
interface GraphErr {
  error?: { message?: string; code?: number; error_subcode?: number };
}

function classifyHttp(status: number): string {
  if (status === 400 || status === 403) return "validation";
  if (status === 429) return "4";
  if (status >= 500) return String(status);
  return "network";
}

export class MetaLiveClient implements MetaClient {
  async publish(input: PublishInput, pageToken: string): Promise<PublishResult> {
    try {
      switch (input.kind) {
        case "text":
          return await this.publishText(input, pageToken);
        case "image":
          return await this.publishImage(input, pageToken);
        case "video":
        case "reel":
          // Video/Reels go through VideoMetaClient (see _shared/video.ts),
          // which runs the resumable upload flow. This branch is a safety net
          // in case this client is ever called directly with those kinds.
          return {
            ok: false,
            errorCode: "not_implemented",
            errorMessage: "Video/Reels must go through the video adapter (publish-worker routes them).",
            retryable: false,
          };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, errorCode: "network", errorMessage: sanitizeErrorText(msg), retryable: true };
    }
  }

  private async graph<T>(path: string, pageToken: string, body: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams({ access_token: pageToken });
    const res = await fetch(`${GRAPH_BASE}${path}?${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });
    const data = (await res.json()) as GraphOk & GraphErr & T;
    if (!res.ok || data.error) {
      const code = data.error?.code;
      throw Object.assign(
        new Error(sanitizeErrorText(data.error?.message ?? `HTTP ${res.status}`)),
        { metaCode: code !== undefined ? String(code) : classifyHttp(res.status) },
      );
    }
    return data;
  }

  private async publishText(input: PublishInput, pageToken: string): Promise<PublishResult> {
    try {
      const data = await this.graph<GraphOk>(`/${input.pageId}/feed`, pageToken, { message: input.caption });
      return { ok: true, remoteId: data.id, remoteUrl: `https://www.facebook.com/${data.id}` };
    } catch (e) {
      return this.toFailure(e);
    }
  }

  private async publishImage(input: PublishInput, pageToken: string): Promise<PublishResult> {
    if (!input.mediaUrl) {
      return { ok: false, errorCode: "100", errorMessage: "Image post requires a media URL.", retryable: false };
    }
    try {
      // NOTE: Meta fetches the URL server-side, so it must be publicly
      // reachable (or a signed URL). Private-bucket URLs will fail here —
      // the media pipeline (Phase 6/7) issues short-lived signed URLs.
      const data = await this.graph<GraphOk & { post_id?: string }>(`/${input.pageId}/photos`, pageToken, {
        url: input.mediaUrl,
        caption: input.caption,
      });
      const remoteId = data.post_id ?? data.id;
      return { ok: true, remoteId, remoteUrl: `https://www.facebook.com/${remoteId}` };
    } catch (e) {
      return this.toFailure(e);
    }
  }

  private toFailure(e: unknown): PublishResult {
    const metaCode = (e as { metaCode?: string }).metaCode ?? "network";
    const message = e instanceof Error ? e.message : "publish failed";
    return { ok: false, errorCode: metaCode, errorMessage: sanitizeErrorText(message), retryable: metaCode === "network" || metaCode === "4" };
  }
}

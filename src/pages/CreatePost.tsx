import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, DemoBadge, EmptyState, PageHeader, PrimaryButton, SecondaryButton, Toasts, pushToast, type Toast,
} from "../components/ui";
import { fetchMedia, fetchPages, formatBytes, useLive, type LiveMedia, type LivePage } from "../lib/db";
import { createNewPost, type NewPostKind } from "../lib/posts";

const MAX_CAPTION = 2000;
const TIMEZONES = ["Asia/Karachi", "UTC", "America/New_York", "Europe/London", "Asia/Dubai"];

export default function CreatePost() {
  const navigate = useNavigate();
  const { live, data: pages } = useLive(fetchPages, [] as LivePage[]);
  const { data: media } = useLive(fetchMedia, [] as LiveMedia[]);
  const [caption, setCaption] = React.useState("");
  const [selectedPages, setSelectedPages] = React.useState<string[]>([]);
  const [mediaId, setMediaId] = React.useState("");
  const [asReel, setAsReel] = React.useState(false);
  const [scheduleAt, setScheduleAt] = React.useState("");
  const [timezone, setTimezone] = React.useState("Asia/Karachi");
  const [error, setError] = React.useState("");
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [busy, setBusy] = React.useState(false);

  const overLimit = caption.length > MAX_CAPTION;
  const chosenMedia = media.find((m) => m.id === mediaId) ?? null;
  const kind: NewPostKind = !chosenMedia ? "text" : chosenMedia.media_type === "video" ? (asReel ? "reel" : "video") : "image";

  const togglePage = (id: string) =>
    setSelectedPages((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const submit = async (mode: "draft" | "schedule" | "now") => {
    setError("");
    if (!live) {
      if (!caption.trim()) {
        setError("Caption is required. Write something before saving.");
        return;
      }
      pushToast(setToasts, "info", `Demo mode — not actually posting. "${mode === "draft" ? "Save Draft" : mode === "schedule" ? "Schedule Post" : "Publish Now"}" was simulated and nothing was published.`);
      return;
    }
    if (overLimit) {
      setError(`Caption is ${caption.length - MAX_CAPTION} characters over the ${MAX_CAPTION} limit.`);
      return;
    }
    setBusy(true);
    try {
      const result = await createNewPost({
        caption,
        kind,
        mediaAssetId: mediaId || undefined,
        pageIds: selectedPages,
        scheduleLocal: mode === "schedule" ? scheduleAt : null,
        timezone,
        publishNow: mode === "now",
        saveDraft: mode === "draft",
      });
      pushToast(
        setToasts,
        "success",
        mode === "draft"
          ? "Draft saved."
          : mode === "now"
            ? `Queued for publishing to ${result.targets_created} Page(s). Watch the Publishing Queue.`
            : `Scheduled for ${result.targets_created} Page(s). The scheduler runs it even with your browser closed.`,
      );
      setCaption("");
      setSelectedPages([]);
      setMediaId("");
      setScheduleAt("");
      navigate("/queue");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the post.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Create Post"
        badge={!live}
        description={live
          ? "Compose once, publish to many Pages. Scheduled posts run server-side — your browser can be closed."
          : "Compose a post, attach media and choose target pages. Everything here is demo — nothing is published."}
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <label htmlFor="caption" className="mb-2 block text-sm font-semibold text-navy">
              Caption {!live && <DemoBadge />}
            </label>
            <textarea
              id="caption"
              rows={6}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={live ? "Write your caption here…" : "Write your caption here… (demo content, e.g. “Demo post 1 — weekend sale!”)"}
              className="w-full rounded-lg border border-border bg-white p-3 text-sm focus:border-primary"
              aria-describedby="caption-count"
            />
            <p id="caption-count" className={`mt-1 text-right text-xs ${overLimit ? "font-bold text-error" : "text-gray-500"}`}>
              {caption.length}/{MAX_CAPTION}
            </p>

            <div className="mt-4">
              <label htmlFor="media-pick" className="mb-2 block text-sm font-semibold text-navy">
                Media {!live && <DemoBadge />}
              </label>
              {live ? (
                <>
                  <select
                    id="media-pick"
                    value={mediaId}
                    onChange={(e) => { setMediaId(e.target.value); setAsReel(false); }}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy"
                  >
                    <option value="">No media (text post)</option>
                    {media.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.storage_path.split("/").pop()} — {m.media_type} · {formatBytes(m.file_size)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    From your <a href="/media" className="font-semibold text-primary hover:underline">Media Library</a>.
                    {chosenMedia?.media_type === "video" && " Videos upload to Meta with progress tracking."}
                  </p>
                  {chosenMedia?.media_type === "video" && (
                    <label className="mt-2 flex items-center gap-2 text-sm text-navy">
                      <input type="checkbox" checked={asReel} onChange={(e) => setAsReel(e.target.checked)} />
                      Publish as Facebook Reel
                    </label>
                  )}
                  {kind !== "text" && (
                    <p className="mt-1 text-xs font-semibold text-primary">Post type: {kind}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-600">
                  Media picker is demo-only here — upload files in the <span className="font-semibold">Media Library</span>. <DemoBadge />
                </p>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="schedule-at" className="mb-2 block text-sm font-semibold text-navy">
                  Schedule for <span className="font-normal text-gray-500">(for “Schedule Post”)</span>
                </label>
                <input
                  id="schedule-at"
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="tz" className="mb-2 block text-sm font-semibold text-navy">Timezone</label>
                <select
                  id="tz"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz}>{tz}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">Stored in UTC; displayed in your timezone everywhere.</p>
          </Card>
        </div>

        <div>
          <Card>
            <h2 className="text-sm font-semibold text-navy">Select Pages {!live && <DemoBadge />}</h2>
            <div className="mt-3">
              {!live ? (
                <EmptyState
                  icon="📄"
                  title="No pages connected yet"
                  body="Connect Facebook to choose real target pages. Page selection arrives with Phase 3."
                />
              ) : pages.length === 0 ? (
                <EmptyState
                  icon="📄"
                  title="No pages connected"
                  body="Connect a Page first — then come back to target it."
                />
              ) : (
                <ul className="max-h-64 space-y-2 overflow-y-auto">
                  {pages.map((p) => (
                    <li key={p.id}>
                      <label className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-bg">
                        <input
                          type="checkbox"
                          checked={selectedPages.includes(p.id)}
                          onChange={() => togglePage(p.id)}
                          className="h-4 w-4"
                        />
                        <span>
                          <span className="block font-semibold text-navy">{p.page_name}</span>
                          <span className={`block text-xs ${p.connection_status === "healthy" ? "text-success" : "text-warning"}`}>
                            {p.connection_status.replace(/_/g, " ")}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <PrimaryButton disabled={busy} onClick={() => void submit("draft")}>
                {busy ? "Saving…" : "Save Draft"}
              </PrimaryButton>
              <SecondaryButton disabled={busy} onClick={() => void submit("schedule")}>
                {busy ? "Scheduling…" : "Schedule Post"}
              </SecondaryButton>
              <PrimaryButton disabled={busy} onClick={() => void submit("now")}>
                {busy ? "Queueing…" : "Publish Now"}
              </PrimaryButton>
              {!live && <p className="text-xs text-gray-500">(Demo Mode — not actually posting)</p>}
              {live && (
                <p className="text-xs text-gray-500">
                  “Publish Now” queues the post for the next scheduler run (every minute once cron is configured).
                </p>
              )}
            </div>
          </Card>

          <Card className="mt-4">
            <h2 className="text-sm font-semibold text-navy">Preview</h2>
            <div className="mt-2 rounded-lg border border-border bg-bg p-3">
              <p className="whitespace-pre-wrap text-sm">{caption.trim() || "Your caption preview will appear here…"}</p>
              {chosenMedia && <p className="mt-2 text-xs text-gray-500">📎 {chosenMedia.storage_path.split("/").pop()} ({kind})</p>}
              {selectedPages.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  → {selectedPages.length} Page{selectedPages.length > 1 ? "s" : ""} selected
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Toasts toasts={toasts} />
    </div>
  );
}

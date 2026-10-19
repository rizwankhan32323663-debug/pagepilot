import React from "react";
import {
  Card, DangerButton, DemoBadge, EmptyState, Modal, PageHeader, SecondaryButton, Toasts, pushToast, type Toast,
} from "../components/ui";
import { deleteMedia, fetchMedia, formatBytes, signedMediaUrl, uploadMedia, useLive, type LiveMedia } from "../lib/db";
import { useAuth } from "../lib/auth";
import { demoMediaItems, type DemoMediaItem } from "../data/demo";

type Tab = "all" | "image" | "video";

interface DemoItem extends DemoMediaItem {
  previewUrl?: string;
  demo: boolean;
}

const initialDemo: DemoItem[] = demoMediaItems.map((m) => ({ ...m, demo: true }));

function PlaceholderThumb({ type, name }: { type: "image" | "video"; name: string }) {
  return (
    <div
      className={`flex h-28 w-full items-center justify-center text-3xl ${
        type === "image"
          ? "bg-gradient-to-br from-blue-100 to-blue-200"
          : "bg-gradient-to-br from-navy/20 to-navy/40"
      }`}
      role="img"
      aria-label={`${type} placeholder for ${name}`}
    >
      {type === "image" ? "🖼️" : "🎬"}
    </div>
  );
}

export default function MediaLibrary() {
  const { user } = useAuth();
  const { live, loading, data: liveMedia, refresh } = useLive(fetchMedia, [] as LiveMedia[]);
  const [demoItems, setDemoItems] = React.useState<DemoItem[]>(initialDemo);
  const [tab, setTab] = React.useState<Tab>("all");
  const [error, setError] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState<LiveMedia | DemoItem | null>(null);
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [previews, setPreviews] = React.useState<Record<string, string>>({});
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  // Signed preview URLs for live items (fetched lazily per item).
  const previewFor = (m: LiveMedia): string | undefined => {
    if (!previews[m.id]) {
      signedMediaUrl(m.storage_path).then((url) => {
        if (url) setPreviews((p) => ({ ...p, [m.id]: url }));
      });
    }
    return previews[m.id];
  };

  const addFiles = async (list: FileList | null) => {
    setError("");
    if (!list || list.length === 0) return;
    if (!live || !user) {
      // Demo fallback: client-side only, same as before.
      const next: DemoItem[] = [];
      for (const f of Array.from(list)) {
        const mb = f.size / (1024 * 1024);
        next.push({
          id: `local-${Date.now()}-${f.name}`,
          name: f.name,
          type: f.type.startsWith("video") ? "video" : "image",
          size: mb < 1 ? `${Math.round(f.size / 1024)} KB` : `${mb.toFixed(1)} MB`,
          dimensions: "preview only",
          previewUrl: URL.createObjectURL(f),
          demo: false,
        });
      }
      if (next.length) {
        setDemoItems((prev) => [...next, ...prev]);
        pushToast(setToasts, "info", `${next.length} file(s) added to the demo library (client-side only, nothing uploaded).`);
      }
      return;
    }
    // Live: validate + upload to private Supabase storage.
    setUploading(true);
    let ok = 0;
    for (const f of Array.from(list)) {
      try {
        await uploadMedia(f, user.id);
        ok++;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      }
    }
    setUploading(false);
    if (ok > 0) {
      pushToast(setToasts, "success", `${ok} file(s) uploaded to your private library.`);
      refresh();
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    if (!live || !("storage_path" in confirmDelete)) {
      const item = confirmDelete as DemoItem;
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      setDemoItems((prev) => prev.filter((i) => i.id !== item.id));
      pushToast(setToasts, "success", `"${item.name}" deleted from the demo library.`);
    } else {
      try {
        await deleteMedia(confirmDelete as LiveMedia);
        pushToast(setToasts, "success", "Media deleted from storage.");
        refresh();
      } catch (e) {
        pushToast(setToasts, "error", e instanceof Error ? e.message : "Delete failed.");
      }
    }
    setConfirmDelete(null);
  };

  const liveVisible = liveMedia.filter((m) => tab === "all" || m.media_type === tab);
  const demoVisible = demoItems.filter((i) => tab === "all" || i.type === tab);

  return (
    <div>
      <PageHeader
        title="Media Library"
        badge={!live}
        description={live
          ? "Your private media library. Files are stored per-user and never public."
          : "Upload, preview and manage media. Demo mode — files stay in your browser until Supabase is connected."}
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-error" role="alert">
          {error}
        </div>
      ) : null}

      {/* Dropzone */}
      <Card className="mb-6">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files); }}
          className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragOver ? "border-primary bg-blue-50" : "border-border bg-bg hover:border-primary"
          } disabled:opacity-60`}
          aria-label="Upload images or videos"
        >
          <span className="text-3xl" aria-hidden="true">☁️</span>
          <span className="mt-2 text-sm font-semibold text-navy">{uploading ? "Uploading…" : "Click to upload or drag and drop"}</span>
          <span className="mt-1 text-xs text-gray-500">
            JPG, PNG, WebP, GIF · max 10 MB · MP4/MOV/WebM · max 1 GB · {live ? "private storage" : "demo only, files stay in your browser"}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
          multiple
          className="hidden"
          aria-label="Choose media files"
          onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }}
        />
      </Card>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-2" role="tablist" aria-label="Media type filter">
        {(["all", "image", "video"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
              tab === t ? "border-primary bg-primary text-white" : "border-border bg-white text-navy hover:bg-bg"
            }`}
          >
            {t === "all" ? "All" : t === "image" ? "Images" : "Videos"}
          </button>
        ))}
        <span className="ml-auto">{live ? <span className="text-xs font-semibold text-success">● Live</span> : <DemoBadge />}</span>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-gray-600">Loading media…</p>
      ) : live ? (
        liveVisible.length === 0 ? (
          <EmptyState icon="🗂️" title="No media here" body="Your library is empty. Upload something above to get started." />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {liveVisible.map((m) => {
              const url = previewFor(m);
              return (
                <Card key={m.id} className="overflow-hidden p-0">
                  {url ? (
                    m.media_type === "image" ? (
                      <img src={url} alt={m.storage_path.split("/").pop()} className="h-28 w-full object-cover" />
                    ) : (
                      <video src={url} className="h-28 w-full object-cover" aria-label={m.storage_path} />
                    )
                  ) : (
                    <PlaceholderThumb type={m.media_type} name={m.storage_path} />
                  )}
                  <div className="p-3">
                    <p className="truncate text-sm font-medium text-gray-900" title={m.storage_path}>
                      {m.storage_path.split("/").pop()}
                    </p>
                    <p className="text-xs text-gray-500">{formatBytes(m.file_size)} · {m.mime_type} · {m.media_type}</p>
                    <div className="mt-2">
                      <DangerButton onClick={() => setConfirmDelete(m)} title="Delete from storage">
                        Delete
                      </DangerButton>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : demoVisible.length === 0 ? (
        <EmptyState
          icon="🗂️"
          title="No media here"
          body={tab === "all" ? "Your library is empty. Upload something above to get started." : `No ${tab}s in the library yet.`}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {demoVisible.map((item) => (
            <Card key={item.id} className="overflow-hidden p-0">
              {item.previewUrl ? (
                item.type === "image" ? (
                  <img src={item.previewUrl} alt={item.name} className="h-28 w-full object-cover" />
                ) : (
                  <video src={item.previewUrl} className="h-28 w-full object-cover" aria-label={item.name} />
                )
              ) : (
                <PlaceholderThumb type={item.type} name={item.name} />
              )}
              <div className="p-3">
                <p className="truncate text-sm font-medium text-gray-900" title={item.name}>{item.name}</p>
                <p className="text-xs text-gray-500">{item.size} · {item.dimensions} · {item.type}</p>
                <div className="mt-1">{item.demo ? <DemoBadge /> : <span className="text-xs text-gray-500">Local preview</span>}</div>
                <div className="mt-2">
                  <DangerButton onClick={() => setConfirmDelete(item)} title={`Delete ${item.name}`}>
                    Delete
                  </DangerButton>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {confirmDelete ? (
        <Modal title="Delete media?" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-gray-700">
            Delete <span className="font-semibold">"{("storage_path" in confirmDelete ? confirmDelete.storage_path.split("/").pop() : confirmDelete.name)}"</span>?
            {live ? " This permanently removes the file from your private storage." : " This only affects this demo session — nothing is stored on a server."}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <SecondaryButton onClick={() => setConfirmDelete(null)}>Cancel</SecondaryButton>
            <DangerButton onClick={() => void doDelete()}>Delete</DangerButton>
          </div>
        </Modal>
      ) : null}

      <Toasts toasts={toasts} />
    </div>
  );
}

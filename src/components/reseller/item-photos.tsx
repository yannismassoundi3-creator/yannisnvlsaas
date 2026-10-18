"use client";

import { Camera, Download, ImagePlus, Share2, SplitSquareHorizontal, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { useLocale } from "@/i18n/client";
import { listingMessages } from "@/i18n/messages/listing";
import { aiCopy, decodePhoto, processPhoto } from "@/lib/photos/browser";
import { PHOTO_SIZES } from "@/lib/photos/enhance";
import { cn } from "@/lib/utils";

/**
 * Item photos in the "Add an item" dialog: 1 to 3 photos taken or picked on
 * the phone, enhanced on the device (light, colour, framing; see
 * src/lib/photos/enhance.ts), with a before/after view, download and share.
 * Nothing is uploaded here: the thumbnail is stored when the item is saved,
 * and photos go to the AI only when the seller asks for a listing.
 */

type Shown = { blob: Blob; url: string };

export type Photo = {
  id: number;
  status: "processing" | "ready";
  before?: Shown;
  after?: Shown;
  showBefore: boolean;
};

type Source = Awaited<ReturnType<typeof decodePhoto>>;

const shown = (blob: Blob): Shown => ({ blob, url: URL.createObjectURL(blob) });

function release(photo: Photo) {
  if (photo.before) URL.revokeObjectURL(photo.before.url);
  if (photo.after) URL.revokeObjectURL(photo.after.url);
}

/** State of the picked photos, shared by the photo list, the AI listing and the save. */
export function usePhotoPicker() {
  const locale = useLocale();
  const t = listingMessages[locale].photos;
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [square, setSquareState] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const sources = useRef(new Map<number, Source>());
  const canvases = useRef(new Map<number, HTMLCanvasElement>());
  const nextId = useRef(1);
  const photosRef = useRef(photos);
  const squareRef = useRef(square);
  // Latest values for the async handlers below (which outlive a render).
  useLayoutEffect(() => {
    photosRef.current = photos;
    squareRef.current = square;
  });

  const update = (id: number, patch: (p: Photo) => Photo) => setPhotos((list) => list.map((p) => (p.id === id ? patch(p) : p)));

  const render = useCallback(async (id: number, source: Source, framing: boolean) => {
    const result = await processPhoto(source, framing);
    if (!sources.current.has(id)) return; // removed meanwhile
    canvases.current.set(id, result.canvas);
    setPhotos((list) =>
      list.map((p) => {
        if (p.id !== id) return p;
        release(p);
        return { ...p, status: "ready", before: shown(result.before), after: shown(result.after) };
      }),
    );
  }, []);

  const add = useCallback(
    async (files: FileList | File[]) => {
      setNotice(null);
      const free = PHOTO_SIZES.maxPhotos - photosRef.current.length;
      const picked = Array.from(files).slice(0, Math.max(0, free));
      if (files.length > free) setNotice(t.max(PHOTO_SIZES.maxPhotos));
      // One at a time: phone memory is limited and each photo can be 12 megapixels.
      for (const file of picked) {
        const id = nextId.current++;
        setPhotos((list) => [...list, { id, status: "processing", showBefore: false }]);
        try {
          const source = await decodePhoto(file);
          sources.current.set(id, source);
          await render(id, source, squareRef.current);
        } catch {
          sources.current.delete(id);
          setPhotos((list) => list.filter((p) => p.id !== id));
          // PhotoDecodeError (e.g. HEIC in a browser that cannot read it) or a canvas failure.
          setNotice(t.decodeFailed);
        }
      }
    },
    [render, t],
  );

  const remove = useCallback((id: number) => {
    const source = sources.current.get(id);
    if (source && "close" in source) source.close();
    sources.current.delete(id);
    canvases.current.delete(id);
    setPhotos((list) => {
      const gone = list.find((p) => p.id === id);
      if (gone) release(gone);
      return list.filter((p) => p.id !== id);
    });
  }, []);

  const setSquare = useCallback(
    async (value: boolean) => {
      setSquareState(value);
      for (const p of photosRef.current) {
        const source = sources.current.get(p.id);
        if (!source) continue;
        update(p.id, (x) => ({ ...x, status: "processing" }));
        await render(p.id, source, value).catch(() => update(p.id, (x) => ({ ...x, status: "ready" })));
      }
    },
    [render],
  );

  const toggleBefore = useCallback((id: number) => update(id, (p) => ({ ...p, showBefore: !p.showBefore })), []);

  const reset = useCallback(() => {
    for (const p of photosRef.current) remove(p.id);
    setNotice(null);
  }, [remove]);

  // Free decoded images and object URLs when the dialog closes.
  useEffect(
    () => () => {
      for (const p of photosRef.current) release(p);
      for (const s of sources.current.values()) if ("close" in s) s.close();
    },
    [],
  );

  const ready = photos.filter((p) => p.status === "ready");
  return {
    photos,
    square,
    notice,
    busy: photos.some((p) => p.status === "processing"),
    readyCount: ready.length,
    add,
    remove,
    setSquare,
    toggleBefore,
    reset,
    /** Enhanced canvas of the first ready photo (source of the stored thumbnail). */
    firstEnhanced: () => (ready[0] ? (canvases.current.get(ready[0].id) ?? null) : null),
    /** Copies for the AI: 1,024 px, JPEG 0.8, base64. */
    aiImages: async () => Promise.all(ready.map((p) => canvases.current.get(p.id)).filter((c): c is HTMLCanvasElement => Boolean(c)).map(aiCopy)),
  };
}

export type PhotoPicker = ReturnType<typeof usePhotoPicker>;

const noSubscription = () => () => undefined;

/** Web Share API with files (phones): false on the server and in most desktop browsers. */
function canShareFiles(): boolean {
  try {
    const probe = new File([new Uint8Array([0xff, 0xd8, 0xff])], "probe.jpg", { type: "image/jpeg" });
    return typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export function ItemPhotos({ picker }: { picker: PhotoPicker }) {
  const id = useId();
  const locale = useLocale();
  const t = listingMessages[locale].photos;
  const input = useRef<HTMLInputElement>(null);
  const canShare = useSyncExternalStore(noSubscription, canShareFiles, () => false);

  const share = async (photo: Photo, n: number) => {
    if (!photo.after) return;
    const file = new File([photo.after.blob], t.fileName(n), { type: "image/jpeg" });
    await navigator.share({ files: [file] }).catch(() => undefined);
  };

  const full = picker.photos.length >= PHOTO_SIZES.maxPhotos;
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 rounded-md border border-line p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`${id}-title`} className="text-sm font-medium text-ink">
          {t.title}
        </h3>
        {picker.photos.length > 0 ? <span className="text-xs text-ink-3 tabular">{t.count(picker.photos.length, PHOTO_SIZES.maxPhotos)}</span> : null}
      </div>
      <p id={`${id}-hint`} className="text-xs text-ink-3">
        {t.hint}
      </p>
      <input
        ref={input}
        id={`${id}-input`}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) void picker.add(Array.from(files));
          e.target.value = "";
        }}
      />
      {!full ? (
        <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => input.current?.click()} aria-describedby={`${id}-hint`}>
          {picker.photos.length === 0 ? <Camera aria-hidden /> : <ImagePlus aria-hidden />}
          {picker.photos.length === 0 ? t.add : t.addMore}
        </Button>
      ) : null}
      {picker.notice ? (
        <Alert tone="caution" role="alert">
          {picker.notice}
        </Alert>
      ) : null}
      {picker.photos.length > 0 ? (
        <>
          <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-ink">
            <input type="checkbox" className="mt-0.5 size-4 accent-navy-800" checked={picker.square} onChange={(e) => void picker.setSquare(e.target.checked)} aria-describedby={`${id}-square-hint`} />
            <span>
              {t.square}
              <span id={`${id}-square-hint`} className="block text-xs text-ink-3">
                {t.squareHint}
              </span>
            </span>
          </label>
          <ul className="grid gap-3 sm:grid-cols-2">
            {picker.photos.map((photo, index) => {
              const n = index + 1;
              const image = photo.showBefore ? photo.before : photo.after;
              return (
                <li key={photo.id} className="overflow-hidden rounded-md border border-line" aria-label={t.photoLabel(n)} aria-busy={photo.status === "processing" || undefined}>
                  {photo.status === "processing" || !image ? (
                    <div className="space-y-2 p-3">
                      <Skeleton className="aspect-square w-full" />
                      <p className="text-xs text-ink-3" role="status">
                        {t.processing}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="relative bg-sunken">
                        {/* Local blob of a photo processed on the device. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.url} alt={photo.showBefore ? t.originalAlt(n) : t.enhancedAlt(n)} className={cn("w-full object-contain", picker.square ? "aspect-square" : "max-h-80")} />
                        <span className="absolute top-2 left-2 rounded-sm bg-surface/90 px-1.5 py-0.5 text-xs font-medium text-ink shadow-xs" aria-hidden>
                          {photo.showBefore ? t.before : t.after}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 p-2">
                        <Button type="button" variant="secondary" size="sm" aria-pressed={photo.showBefore} aria-label={t.compareLabel(n)} onClick={() => picker.toggleBefore(photo.id)}>
                          <SplitSquareHorizontal aria-hidden />
                          {t.compare}
                        </Button>
                        {photo.after ? (
                          <a href={photo.after.url} download={t.fileName(n)} className={buttonVariants({ variant: "secondary", size: "sm" })} aria-label={t.downloadLabel(n)}>
                            <Download aria-hidden />
                            {t.download}
                          </a>
                        ) : null}
                        {canShare && photo.after ? (
                          <Button type="button" variant="secondary" size="sm" aria-label={t.shareLabel(n)} onClick={() => void share(photo, n)}>
                            <Share2 aria-hidden />
                            {t.share}
                          </Button>
                        ) : null}
                        <Button type="button" variant="ghost" size="sm" aria-label={t.removeLabel(n)} onClick={() => picker.remove(photo.id)}>
                          <Trash2 aria-hidden />
                          {t.remove}
                        </Button>
                      </div>
                      <p className="sr-only" aria-live="polite">
                        {t.showing(photo.showBefore ? t.before : t.after)}
                      </p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}

import { describe, expect, it, vi } from "vitest";
import { photoUrlsFor, signPhotoPaths, storePhotoUrls } from "@/lib/photos/storage";

/**
 * Thumbnails degrade to "no photo" while the photos migration is not in the
 * database (unknown column, missing bucket) or Storage is unreachable.
 */

type Fake = Parameters<typeof signPhotoPaths>[0];

function client(opts: { rows?: { id: string; photo_path: string | null }[]; error?: { code: string } | null; signed?: unknown; signError?: unknown; throws?: boolean }) {
  const query = {
    select: () => query,
    in: () => query,
    eq: () => query,
    not: () => query,
    limit: () => query,
    then: (resolve: (v: unknown) => void) => resolve({ data: opts.error ? null : (opts.rows ?? []), error: opts.error ?? null }),
  };
  const createSignedUrls = vi.fn(async (paths: string[], ttl?: number) => {
    if (opts.throws) throw new Error("network");
    if (opts.signError) return { data: null, error: opts.signError };
    return { data: opts.signed ?? paths.map((path) => ({ path, signedUrl: `https://x.supabase.co/storage/v1/object/sign/item-photos/${path}?token=t&ttl=${ttl}`, error: null })), error: null };
  });
  return { fake: { from: () => query, storage: { from: () => ({ createSignedUrls }) } } as unknown as Fake, createSignedUrls };
}

describe("item photo URLs", () => {
  it("signs the photos of the listed items in one request", async () => {
    const { fake, createSignedUrls } = client({ rows: [{ id: "p1", photo_path: "o/p1/a.jpg" }, { id: "p2", photo_path: "o/p2/b.jpg" }] });
    const urls = await photoUrlsFor(fake, ["p1", "p2", "p3"]);
    expect(Object.keys(urls)).toEqual(["p1", "p2"]);
    expect(urls.p1).toContain("/object/sign/item-photos/o/p1/a.jpg");
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls.mock.calls[0][1]).toBe(900);
  });

  it("returns no photo when the photo_path column does not exist yet", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { fake, createSignedUrls } = client({ error: { code: "42703" } });
    expect(await photoUrlsFor(fake, ["p1"])).toEqual({});
    expect(await storePhotoUrls(fake, "store")).toEqual({});
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("returns no photo when the bucket is missing or Storage is down", async () => {
    const rows = [{ id: "p1", photo_path: "o/p1/a.jpg" }];
    expect(await photoUrlsFor(client({ rows, signError: { message: "Bucket not found" } }).fake, ["p1"])).toEqual({});
    expect(await photoUrlsFor(client({ rows, throws: true }).fake, ["p1"])).toEqual({});
  });

  it("skips files that could not be signed", async () => {
    const { fake } = client({ rows: [{ id: "p1", photo_path: "o/p1/a.jpg" }], signed: [{ path: "o/p1/a.jpg", signedUrl: null, error: "Object not found" }] });
    expect(await photoUrlsFor(fake, ["p1"])).toEqual({});
  });
});

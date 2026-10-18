import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingObject } from "@/lib/listing/quota";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Item thumbnails in Supabase Storage (private bucket "item-photos", path
 * <organization_id>/<product_id>/<uuid>.jpg). Every helper degrades to "no
 * photo" when the photos migration is not in the database yet (no column, no
 * bucket), so pages never fail because of a thumbnail.
 */

export const ITEM_PHOTOS_BUCKET = "item-photos";
/** Signed URLs shown in pages are short-lived; a new page view signs new ones. */
export const PHOTO_URL_TTL_SECONDS = 15 * 60;
/** The bucket refuses larger files; checked first for a clear error. */
export const MAX_THUMBNAIL_BYTES = 300 * 1024;

type Client = SupabaseClient<Database>;

/** Signed URLs for these paths (in one request); missing ones are simply absent. */
export async function signPhotoPaths(supabase: Client, paths: readonly string[], ttl = PHOTO_URL_TTL_SECONDS): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const urls = new Map<string, string>();
  if (unique.length === 0) return urls;
  try {
    for (let i = 0; i < unique.length; i += 500) {
      const { data, error } = await supabase.storage.from(ITEM_PHOTOS_BUCKET).createSignedUrls(unique.slice(i, i + 500), ttl);
      if (error || !data) return urls;
      for (const entry of data) if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
    }
  } catch {
    // Storage unreachable: no thumbnails.
  }
  return urls;
}

/** Photo path of each listed product that has one (by product id). */
export async function photoPathsFor(supabase: Client, productIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (productIds.length === 0) return out;
  const { data, error } = await supabase.from("products").select("id, photo_path").in("id", [...productIds]).not("photo_path", "is", null);
  if (error) {
    if (!isMissingObject(error.code)) console.error("[photos] path read failed", { code: error.code });
    return out;
  }
  for (const row of data ?? []) if (row.photo_path) out.set(row.id, row.photo_path);
  return out;
}

/** Thumbnail URLs of these products (by product id). */
export async function photoUrlsFor(supabase: Client, productIds: readonly string[]): Promise<Record<string, string>> {
  const paths = await photoPathsFor(supabase, productIds);
  const urls = await signPhotoPaths(supabase, [...paths.values()]);
  const out: Record<string, string> = {};
  for (const [id, path] of paths) {
    const url = urls.get(path);
    if (url) out[id] = url;
  }
  return out;
}

/** Thumbnail URLs of a store's items that have one (at most 1,000), by product id. */
export async function storePhotoUrls(supabase: Client, storeId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("products").select("id, photo_path").eq("store_id", storeId).not("photo_path", "is", null).limit(1000);
  if (error) {
    if (!isMissingObject(error.code)) console.error("[photos] store paths read failed", { code: error.code });
    return {};
  }
  const rows = (data ?? []).filter((r): r is { id: string; photo_path: string } => Boolean(r.photo_path));
  const urls = await signPhotoPaths(supabase, rows.map((r) => r.photo_path));
  const out: Record<string, string> = {};
  for (const r of rows) {
    const url = urls.get(r.photo_path);
    if (url) out[r.id] = url;
  }
  return out;
}

/** Deletes files (best effort: a leftover file is harmless and private). */
export async function removePhotoPaths(supabase: Client, paths: readonly string[]): Promise<void> {
  const list = [...new Set(paths.filter(Boolean))];
  try {
    for (let i = 0; i < list.length; i += 1000) {
      const { error } = await supabase.storage.from(ITEM_PHOTOS_BUCKET).remove(list.slice(i, i + 1000));
      if (error) {
        console.error("[photos] delete failed", { count: list.length });
        return;
      }
    }
  } catch {
    // Storage unreachable.
  }
}

/** Photo paths of a store's items (before the store is deleted). */
export async function storePhotoPaths(supabase: Client, storeId: string): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; from < 1_000_000; from += 1000) {
    const { data, error } = await supabase
      .from("products")
      .select("id, photo_path")
      .eq("store_id", storeId)
      .not("photo_path", "is", null)
      .order("id")
      .range(from, from + 999);
    if (error || !data) break;
    for (const r of data) if (r.photo_path) out.push(r.photo_path);
    if (data.length < 1000) break;
  }
  return out;
}

/**
 * Every file of an organisation's folder (<organization_id>/<product_id>/…),
 * including files whose item was never saved, for account deletion. Needs the
 * service role (it lists the folder as a whole).
 */
export async function organizationPhotoPaths(admin: Client, organizationId: string): Promise<string[]> {
  const bucket = admin.storage.from(ITEM_PHOTOS_BUCKET);
  const paths: string[] = [];
  try {
    for (let offset = 0; offset < 100_000; offset += 1000) {
      const { data: folders, error } = await bucket.list(organizationId, { limit: 1000, offset });
      if (error || !folders) break;
      for (const folder of folders) {
        const { data: files } = await bucket.list(`${organizationId}/${folder.name}`, { limit: 1000 });
        for (const file of files ?? []) if (file.id) paths.push(`${organizationId}/${folder.name}/${file.name}`);
      }
      if (folders.length < 1000) break;
    }
  } catch {
    // Storage unreachable or bucket missing: nothing to delete.
  }
  return paths;
}

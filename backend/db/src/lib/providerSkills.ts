import pool from './mysql';
import type { PoolConnection } from 'mysql2/promise';

export function providerSupportsServices(provider: any, serviceTags: string[][]): boolean {
  try {
    const raw = typeof provider.services === 'string' ? JSON.parse(provider.services) : provider.services;
    if (!Array.isArray(raw) || !serviceTags.length) return false;
    const skills = new Set(raw.map((tag) => String(tag).trim().toLowerCase()));
    return serviceTags.every((tags) => tags.some((tag) => skills.has(tag.trim().toLowerCase())));
  } catch {
    return false;
  }
}

/**
 * Canonical skill tags for a catalog service, looked up by catalog ID first
 * and then by exact service name. Returns [] when the value isn't in the
 * catalog — callers that need the old "unknown names only match themselves"
 * behaviour should use skillTagsForService instead.
 */
export async function catalogSkillTagsForService(
  service: { id?: unknown; name?: unknown },
  db: typeof pool | PoolConnection = pool
): Promise<string[]> {
  const id = Number(service?.id);
  const name = String(service?.name || '').trim();
  if (!Number.isSafeInteger(id) || id <= 0) {
    if (!name) return [];
  }
  const nameCandidates = [name, name.replace(/\s*\([^)]*\)\s*$/, '').trim()]
    .filter((n, i, all) => n && all.indexOf(n) === i);
  let row: any = null;
  if (Number.isSafeInteger(id) && id > 0) {
    const [rows]: any = await db.query(
      `SELECT s.name AS service_name, sc.name AS subcategory_name, c.name AS category_name
         FROM catalog_services s
         LEFT JOIN catalog_subcategories sc ON sc.id = s.subcategory_id
         LEFT JOIN catalog_categories c ON c.id = sc.category_id
        WHERE s.id = ?
        LIMIT 1`,
      [id]
    );
    row = (rows as any[])[0];
  } else {
    for (const candidate of nameCandidates) {
      const [rows]: any = await db.query(
        `SELECT s.name AS service_name, sc.name AS subcategory_name, c.name AS category_name
           FROM catalog_services s
           LEFT JOIN catalog_subcategories sc ON sc.id = s.subcategory_id
           LEFT JOIN catalog_categories c ON c.id = sc.category_id
          WHERE LOWER(s.name) = LOWER(?)
          LIMIT 1`,
        [candidate]
      );
      row = (rows as any[])[0];
      if (row) break;
    }
  }
  if (!row) return [];
  const tags: string[] = [];
  for (const tag of [row.service_name, row.subcategory_name, row.category_name]) {
    const t = String(tag || '').trim();
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
  }
  return tags;
}

/**
 * The skill tags that qualify a provider for a catalog service. Marketplace
 * providers are tagged with exact catalog service names ("Head Massage
 * 30 min"); vendor Partner OS members are tagged with the subcategory they
 * work under ("Head Massage") or the whole top-level category
 * ("Wellness @ Home") — both forms come out of the vendor Team picker. So a
 * booking for a service matches any provider whose `services` list contains
 * the service's own name, its subcategory's name or its category's name.
 * Returned deduped, original casing.
 */
export async function skillTagsForService(serviceName: string, db: typeof pool | PoolConnection = pool): Promise<string[]> {
  const name = String(serviceName || '').trim();
  if (!name) return [];
  const tags = await catalogSkillTagsForService({ name }, db);
  return tags.length ? tags : [name];
}

/**
 * Every skill tag that lives under a catalog category — the category's own
 * name, its subcategory names and the service names beneath them. A job that
 * only knows its category (a vendor's own free-text job) is servable by a
 * member tagged at any level inside it; [] for names that aren't a canonical
 * catalog category.
 */
export async function skillTagsForCategory(
  categoryName: unknown,
  db: typeof pool | PoolConnection = pool
): Promise<string[]> {
  const name = String(categoryName || '').trim();
  if (!name) return [];
  const [rows]: any = await db.query(
    `SELECT c.name AS category_name, sc.name AS subcategory_name, s.name AS service_name
       FROM catalog_categories c
       LEFT JOIN catalog_subcategories sc ON sc.category_id = c.id
       LEFT JOIN catalog_services s ON s.subcategory_id = sc.id
      WHERE LOWER(c.name) = LOWER(?)`,
    [name]
  );
  const tags: string[] = [];
  for (const row of rows as any[]) {
    for (const tag of [row.category_name, row.subcategory_name, row.service_name]) {
      const t = String(tag || '').trim();
      if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
    }
  }
  return tags;
}

/**
 * Validates a proposed provider `services` list against real catalog names —
 * a tag only matches bookings when it is exactly a service, subcategory or
 * category name, so free-text typos must never be stored. Returns the
 * canonical-cased tags plus the entries that matched nothing.
 */
export async function canonicalSkillTags(
  names: unknown,
  db: typeof pool | PoolConnection = pool
): Promise<{ tags: string[]; unknown: string[] }> {
  const list = Array.isArray(names)
    ? names.map((s) => String(s).trim()).filter(Boolean)
    : [];
  if (!list.length) return { tags: [], unknown: [] };

  const [rows]: any = await db.query(
    `SELECT name FROM catalog_services
      UNION SELECT name FROM catalog_subcategories
      UNION SELECT name FROM catalog_categories`
  );
  const canon = new Map<string, string>(
    (rows as any[]).map((r) => [String(r.name).toLowerCase(), String(r.name)])
  );

  const tags: string[] = [];
  const unknown: string[] = [];
  for (const n of list) {
    const hit = canon.get(n.toLowerCase());
    if (hit) tags.push(hit);
    else unknown.push(n);
  }
  return { tags: [...new Set(tags)], unknown };
}

/**
 * Skills required by a vendor job. A Kynd job linked to a booking resolves
 * every non-addon booking item (catalog ID first, so labels such as
 * "Nail Art (avg of $10-$20 range)" still resolve to the catalog service).
 * Standalone jobs use an exact catalog service name, then the canonical
 * category. Unknown free-text own-job labels return [] so the caller can
 * decide whether that job needs a hard skill check at all.
 */
export async function skillRequirementsForJob(
  job: { booking_id?: unknown; service_label?: unknown; category?: unknown; source?: unknown },
  db: typeof pool | PoolConnection = pool
): Promise<string[][]> {
  const bookingId = Number(job?.booking_id);
  if (Number.isSafeInteger(bookingId) && bookingId > 0) {
    const [rows]: any = await db.query('SELECT items FROM bookings WHERE id = ?', [bookingId]);
    let items: any[] = [];
    try {
      const parsed = typeof rows?.[0]?.items === 'string' ? JSON.parse(rows[0].items) : rows?.[0]?.items;
      if (Array.isArray(parsed)) items = parsed;
    } catch { /* Fall through to the job's own labels below. */ }
    const requirements = await Promise.all(
      items
        .filter((item) => !item?.addonId)
        .map(async (item) => {
          const tags = await catalogSkillTagsForService(
            {
              id: item?.catalogId ?? item?.catalogServiceId ?? item?.serviceId ?? item?.service_id,
              name: item?.name || item?.serviceName,
            },
            db
          );
          const fallback = String(item?.name || item?.serviceName || '').trim();
          return tags.length ? tags : fallback ? [fallback] : [];
        })
    );
    if (requirements.some((tags) => tags.length)) {
      return requirements.filter((tags) => tags.length);
    }
  }

  const serviceTags = await catalogSkillTagsForService({ name: job?.service_label }, db);
  if (serviceTags.length) return [serviceTags];

  // Only a category is known (own job, free-text label): any member tagged
  // with the category or a skill nested under it qualifies. canonicalSkillTags
  // still covers a `category` value that is actually a subcategory/service
  // name.
  const { tags: categoryTags } = await canonicalSkillTags([job?.category], db);
  const nestedTags = await skillTagsForCategory(job?.category, db);
  const merged = [...new Set([...categoryTags, ...nestedTags])];
  return merged.length ? [merged] : [];
}

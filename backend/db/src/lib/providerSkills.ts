import pool from './mysql';

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
export async function skillTagsForService(serviceName: string): Promise<string[]> {
  const name = String(serviceName || '').trim();
  if (!name) return [];
  const [rows]: any = await pool.query(
    `SELECT sc.name AS subcategory_name, c.name AS category_name
       FROM catalog_services s
       LEFT JOIN catalog_subcategories sc ON sc.id = s.subcategory_id
       LEFT JOIN catalog_categories c ON c.id = sc.category_id
      WHERE LOWER(s.name) = LOWER(?)
      LIMIT 1`,
    [name]
  );
  const tags = [name];
  for (const tag of [rows?.[0]?.subcategory_name, rows?.[0]?.category_name]) {
    const t = String(tag || '').trim();
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
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
  names: unknown
): Promise<{ tags: string[]; unknown: string[] }> {
  const list = Array.isArray(names)
    ? names.map((s) => String(s).trim()).filter(Boolean)
    : [];
  if (!list.length) return { tags: [], unknown: [] };

  const [rows]: any = await pool.query(
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

import pool from "./mysql";
import mysql from "mysql2/promise";
import {
  CreateServiceSubcategoryInput,
  ServiceSubcategory,
  ServiceSubcategoryDetail,
  UpdateServiceSubcategoryInput,
} from "./service-subcategory-types";

interface DbSubcategoryRow {
  id: number;
  slug: string;
  category: string | null;
  label: string;
  title: string;
  image: string | null;
  sort_order: number;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

function mapRow(row: DbSubcategoryRow): ServiceSubcategory {
  return {
    id: row.id.toString(),
    slug: row.slug,
    category: row.category,
    label: row.label,
    title: row.title,
    image: row.image,
    sortOrder: row.sort_order,
    tags: row.tags ? row.tags.split("|") : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const DEFAULT_MARKUP_PCT = 30;

function catalogSellPrice(defaultPartnerCost: number | null | string, markupOverride: number | null | string): number | null {
  if (defaultPartnerCost === null) return null;
  const cost = Number(defaultPartnerCost);
  if (!Number.isFinite(cost)) return null;
  const markup = markupOverride !== null && markupOverride !== undefined ? Number(markupOverride) : DEFAULT_MARKUP_PCT;
  const sell = Math.round(cost * (1 + (Number.isFinite(markup) ? markup : DEFAULT_MARKUP_PCT) / 100));
  return sell;
}

async function fetchServicesForSubcategory(subcategoryId: number) {
  const [svcRows] = await pool.query(
    `SELECT s.id, s.name, s.image, s.duration, s.default_partner_cost, s.markup_pct_override, c.name as category
     FROM catalog_services s
     JOIN catalog_categories c ON s.category_id = c.id
     JOIN service_subcategory_services ss ON s.id = ss.service_id
     WHERE ss.subcategory_id = ?
     ORDER BY s.id`,
    [subcategoryId]
  );

  return (svcRows as any[]).map((s) => {
    const price = catalogSellPrice(s.default_partner_cost, s.markup_pct_override);
    return {
      id: s.id.toString(),
      name: s.name,
      category: s.category,
      price,
      image: s.image,
      duration: s.duration || 'Variable',
      pricingFrom: price !== null ? `S$${price.toFixed(2)}` : 'Custom quote',
    };
  });
}

async function syncSubcategoryServices(
  subcategoryId: number,
  serviceIds: string[]
): Promise<void> {
  await pool.query(`DELETE FROM service_subcategory_services WHERE subcategory_id = ?`, [
    subcategoryId,
  ]);

  if (serviceIds.length === 0) return;

  const placeholders = serviceIds.map(() => "(?, ?)").join(", ");
  const params: (number | string)[] = [];
  for (const serviceId of serviceIds) {
    params.push(subcategoryId, serviceId);
  }

  await pool.query(
    `INSERT INTO service_subcategory_services (subcategory_id, service_id) VALUES ${placeholders}`,
    params
  );
}

export async function getServiceSubcategories(): Promise<ServiceSubcategory[]> {
  const [rows] = await pool.query(
    `SELECT sc.id, sc.slug, sc.category, sc.label, sc.title, sc.image, sc.sort_order,
            GROUP_CONCAT(s.name ORDER BY s.id SEPARATOR '|') AS tags,
            sc.created_at, sc.updated_at
     FROM service_subcategories sc
     LEFT JOIN service_subcategory_services ss ON sc.id = ss.subcategory_id
     LEFT JOIN catalog_services s ON ss.service_id = s.id
     GROUP BY sc.id
     ORDER BY sc.sort_order, sc.id`
  );
  return (rows as DbSubcategoryRow[]).map(mapRow);
}

export async function getServiceSubcategoryById(
  idOrSlug: string
): Promise<ServiceSubcategoryDetail | null> {
  const whereClause = isNumericId(idOrSlug) ? "sc.id = ?" : "sc.slug = ?";
  const [catRows] = await pool.query(
    `SELECT sc.id, sc.slug, sc.category, sc.label, sc.title, sc.image, sc.sort_order,
            sc.created_at, sc.updated_at
     FROM service_subcategories sc
     WHERE ${whereClause}`,
    [idOrSlug]
  );
  const typedCatRows = catRows as DbSubcategoryRow[];
  if (typedCatRows.length === 0) return null;
  const cat = typedCatRows[0];
  const services = await fetchServicesForSubcategory(cat.id);

  return {
    ...mapRow({ ...cat, tags: null }),
    tags: services.map((s) => s.name),
    services,
  };
}

export async function createServiceSubcategory(
  input: CreateServiceSubcategoryInput
): Promise<ServiceSubcategoryDetail> {
  const slug = (input.slug?.trim() || slugify(input.title)).slice(0, 100);
  if (!slug) {
    throw new Error("Slug is required.");
  }

  const [result] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO service_subcategories (slug, category, label, title, image, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      slug,
      input.category?.trim() || null,
      input.label.trim(),
      input.title.trim(),
      input.image || null,
      input.sortOrder ?? 0,
    ]
  );

  const insertId = result.insertId;
  await syncSubcategoryServices(insertId, input.serviceIds ?? []);

  const created = await getServiceSubcategoryById(String(insertId));
  if (!created) {
    throw new Error("Failed to load created subcategory.");
  }
  return created;
}

export async function updateServiceSubcategory(
  id: string,
  input: UpdateServiceSubcategoryInput
): Promise<ServiceSubcategoryDetail | null> {
  const existing = await getServiceSubcategoryById(id);
  if (!existing) return null;

  const slug = (input.slug?.trim() || existing.slug).slice(0, 100);
  const [result] = await pool.query<mysql.ResultSetHeader>(
    `UPDATE service_subcategories
     SET slug = ?, category = ?, label = ?, title = ?, image = ?, sort_order = ?
     WHERE id = ?`,
    [
      slug,
      input.category !== undefined ? input.category?.trim() || null : existing.category,
      input.label?.trim() ?? existing.label,
      input.title?.trim() ?? existing.title,
      input.image !== undefined ? input.image || null : existing.image,
      input.sortOrder ?? existing.sortOrder,
      existing.id,
    ]
  );

  if (result.affectedRows === 0) return null;

  if (input.serviceIds !== undefined) {
    await syncSubcategoryServices(Number(existing.id), input.serviceIds);
  }

  return getServiceSubcategoryById(existing.id);
}

export async function deleteServiceSubcategory(id: string): Promise<boolean> {
  const existing = await getServiceSubcategoryById(id);
  if (!existing) return false;

  const [result] = await pool.query<mysql.ResultSetHeader>(
    `DELETE FROM service_subcategories WHERE id = ?`,
    [existing.id]
  );
  return result.affectedRows > 0;
}

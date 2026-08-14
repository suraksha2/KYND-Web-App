import pool from "./mysql";
import { ServiceSubcategory, ServiceSubcategoryDetail } from "./service-subcategory-types";

interface DbSubcategoryRow {
  id: number;
  category: string | null;
  label: string;
  title: string;
  image: string | null;
  sort_order: number;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

export async function getServiceSubcategories(): Promise<ServiceSubcategory[]> {
  const [rows] = await pool.query(
    `SELECT sc.id, sc.category, sc.label, sc.title, sc.image, sc.sort_order,
            GROUP_CONCAT(s.name ORDER BY s.id SEPARATOR '|') AS tags,
            sc.created_at, sc.updated_at
     FROM service_subcategories sc
     LEFT JOIN service_subcategory_services ss ON sc.id = ss.subcategory_id
     LEFT JOIN services s ON ss.service_id = s.id
     GROUP BY sc.id
     ORDER BY sc.sort_order, sc.id`
  );
  return (rows as DbSubcategoryRow[]).map((row) => ({
    id: row.id.toString(),
    category: row.category,
    label: row.label,
    title: row.title,
    image: row.image,
    sortOrder: row.sort_order,
    tags: row.tags ? row.tags.split("|") : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getServiceSubcategoryById(id: string): Promise<ServiceSubcategoryDetail | null> {
  const [catRows] = await pool.query(
    `SELECT id, category, label, title, image, sort_order, created_at, updated_at FROM service_subcategories WHERE id = ?`,
    [id]
  );
  const typedCatRows = catRows as DbSubcategoryRow[];
  if (typedCatRows.length === 0) return null;
  const cat = typedCatRows[0];

  const [svcRows] = await pool.query(
    `SELECT s.id, s.name, s.category, s.price, s.image, s.duration
     FROM services s
     JOIN service_subcategory_services ss ON s.id = ss.service_id
     WHERE ss.subcategory_id = ?
     ORDER BY s.id`,
    [id]
  );

  const services = (svcRows as any[]).map((s) => ({
    id: s.id.toString(),
    name: s.name,
    category: s.category,
    price: s.price ? parseFloat(s.price) : null,
    image: s.image,
    duration: s.duration,
    pricingFrom: s.price ? `S$${parseFloat(s.price).toFixed(2)}` : '',
  }));

  return {
    id: cat.id.toString(),
    category: cat.category,
    label: cat.label,
    title: cat.title,
    image: cat.image,
    sortOrder: cat.sort_order,
    tags: [],
    services,
    createdAt: cat.created_at,
    updatedAt: cat.updated_at,
  };
}

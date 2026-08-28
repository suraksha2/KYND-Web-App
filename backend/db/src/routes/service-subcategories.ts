import { Router } from 'express';
import {
  createServiceSubcategory,
  deleteServiceSubcategory,
  getServiceSubcategories,
  getServiceSubcategoryById,
  slugify,
  updateServiceSubcategory,
} from '../lib/service-subcategories-db';
import { CreateServiceSubcategoryInput, UpdateServiceSubcategoryInput } from '../lib/service-subcategory-types';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const subcategories = await getServiceSubcategories();
    return res.status(200).json({ data: subcategories });
  } catch (err) {
    console.error("[GET /api/service-subcategories]", err);
    return res.status(500).json({ error: "Failed to fetch service subcategories." });
  }
});

router.post('/', async (req, res) => {
  try {
    const body: CreateServiceSubcategoryInput = req.body;

    if (!body.label?.trim() || !body.title?.trim()) {
      return res.status(400).json({ error: "Label and title are required." });
    }

    const created = await createServiceSubcategory({
      slug: body.slug?.trim() || slugify(body.title),
      category: body.category?.trim() || null,
      label: body.label.trim(),
      title: body.title.trim(),
      image: body.image || null,
      sortOrder: Number(body.sortOrder) || 0,
      serviceIds: Array.isArray(body.serviceIds) ? body.serviceIds.map(String) : [],
    });

    return res.status(201).json({ data: created });
  } catch (err: any) {
    console.error("[POST /api/service-subcategories]", err);
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "A help moment with this slug already exists." });
    }
    return res.status(500).json({ error: "Failed to create service subcategory." });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const subcategory = await getServiceSubcategoryById(req.params.id);
    if (!subcategory) {
      return res.status(404).json({ error: "Service subcategory not found." });
    }
    return res.status(200).json({ data: subcategory });
  } catch (err) {
    console.error("[GET /api/service-subcategories/[id]]", err);
    return res.status(500).json({ error: "Failed to fetch service subcategory." });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const body: UpdateServiceSubcategoryInput = req.body;

    if (body.label !== undefined && !body.label.trim()) {
      return res.status(400).json({ error: "Label cannot be empty." });
    }
    if (body.title !== undefined && !body.title.trim()) {
      return res.status(400).json({ error: "Title cannot be empty." });
    }

    const updated = await updateServiceSubcategory(req.params.id, {
      ...body,
      slug: body.slug?.trim(),
      category: body.category?.trim(),
      label: body.label?.trim(),
      title: body.title?.trim(),
      serviceIds: Array.isArray(body.serviceIds) ? body.serviceIds.map(String) : body.serviceIds,
    });

    if (!updated) {
      return res.status(404).json({ error: "Service subcategory not found." });
    }

    return res.status(200).json({ data: updated });
  } catch (err: any) {
    console.error("[PUT /api/service-subcategories/[id]]", err);
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "A help moment with this slug already exists." });
    }
    return res.status(500).json({ error: "Failed to update service subcategory." });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteServiceSubcategory(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Service subcategory not found." });
    }
    return res.status(200).json({ message: "Service subcategory deleted." });
  } catch (err) {
    console.error("[DELETE /api/service-subcategories/[id]]", err);
    return res.status(500).json({ error: "Failed to delete service subcategory." });
  }
});

export default router;

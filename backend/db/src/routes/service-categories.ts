import { Router } from 'express';
import {
  getServiceCategories,
  getServiceCategoryById,
  createServiceCategory,
  updateServiceCategory,
  deleteServiceCategory,
} from '../lib/service-categories-db';
import { CreateServiceCategoryInput, UpdateServiceCategoryInput } from '../lib/service-category-types';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const categories = await getServiceCategories();
    return res.status(200).json({ data: categories });
  } catch {
    return res.status(500).json({ error: "Failed to fetch service categories." });
  }
});

router.post('/', async (req, res) => {
  try {
    const body: CreateServiceCategoryInput = req.body;

    if (!body.name?.trim()) {
      return res.status(400).json({ error: "Category name is required." });
    }

    const created = await createServiceCategory({
      name: body.name.trim(),
      description: body.description?.trim() ?? "",
    });

    return res.status(201).json({ data: created });
  } catch {
    return res.status(500).json({ error: "Failed to create service category." });
  }
});

router.get('/:id', async (req, res) => {
  const category = await getServiceCategoryById(req.params.id);
  if (!category) {
    return res.status(404).json({ error: "Service category not found." });
  }
  return res.status(200).json({ data: category });
});

router.put('/:id', async (req, res) => {
  try {
    const body: UpdateServiceCategoryInput = req.body;
    if (body.name !== undefined && !body.name.trim()) {
      return res.status(400).json({ error: "Category name cannot be empty." });
    }

    const updated = await updateServiceCategory(req.params.id, {
      ...body,
      name: body.name?.trim(),
      description: body.description?.trim(),
    });

    if (!updated) {
      return res.status(404).json({ error: "Service category not found." });
    }

    return res.status(200).json({ data: updated });
  } catch {
    return res.status(500).json({ error: "Failed to update service category." });
  }
});

router.delete('/:id', async (req, res) => {
  const deleted = await deleteServiceCategory(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: "Service category not found." });
  }
  return res.status(200).json({ message: "Service category deleted." });
});

export default router;

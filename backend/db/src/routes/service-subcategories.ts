import { Router } from 'express';
import { getServiceSubcategories, getServiceSubcategoryById } from '../lib/service-subcategories-db';

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

export default router;

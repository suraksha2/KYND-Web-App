import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_PATH = path.join(process.cwd(), "data", "client-categories.json");

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const data = await fs.readFile(DATA_PATH, "utf-8");
    const categories = JSON.parse(data);
    return res.status(200).json({ data: categories });
  } catch (err) {
    console.error("[GET /api/client-categories]", err);
    return res.status(500).json({ error: "Failed to fetch client categories." });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim()) {
      return res.status(400).json({ error: "Category name is required." });
    }
    const data = await fs.readFile(DATA_PATH, "utf-8");
    const categories = JSON.parse(data);
    const newCategory = {
      id: Date.now(),
      name: body.name.trim(),
      description: body.description?.trim() ?? "",
    };
    categories.push(newCategory);
    await fs.writeFile(DATA_PATH, JSON.stringify(categories, null, 2), "utf-8");
    return res.status(201).json({ data: newCategory });
  } catch (err) {
    console.error("[POST /api/client-categories]", err);
    return res.status(500).json({ error: "Failed to create client category." });
  }
});

export default router;

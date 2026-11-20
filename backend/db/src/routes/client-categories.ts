import { Router } from 'express';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';

const DATA_PATH = path.join(process.cwd(), "data", "client-categories.json");

const router = Router();
let writeQueue: Promise<void> = Promise.resolve();

type ClientCategory = {
  id: string;
  name: string;
  description: string;
};

function serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function writeCategories(categories: ClientCategory[]): Promise<void> {
  const temporaryPath = `${DATA_PATH}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, JSON.stringify(categories, null, 2), {
      encoding: "utf-8",
      flag: "wx",
    });
    await fs.rename(temporaryPath, DATA_PATH);
  } catch (err) {
    await fs.unlink(temporaryPath).catch(() => undefined);
    throw err;
  }
}

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
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return res.status(400).json({ error: "Category name is required." });
    }

    const newCategory = await serializeWrite(async () => {
      const data = await fs.readFile(DATA_PATH, "utf-8");
      const categories: ClientCategory[] = JSON.parse(data);
      const category: ClientCategory = {
        id: `cat_${randomUUID()}`,
        name: body.name.trim(),
        description: typeof body.description === 'string' ? body.description.trim() : "",
      };
      categories.push(category);
      await writeCategories(categories);
      return category;
    });

    return res.status(201).json({ data: newCategory });
  } catch (err) {
    console.error("[POST /api/client-categories]", err);
    return res.status(500).json({ error: "Failed to create client category." });
  }
});

export default router;

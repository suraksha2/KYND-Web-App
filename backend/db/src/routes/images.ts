import { Router } from 'express';
import { readdir } from 'fs/promises';
import path from 'path';

const IMAGE_EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.avif'];

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const dir = path.join(process.cwd(), 'public', 'images');
    const entries = await readdir(dir, { withFileTypes: true });

    const images = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          !entry.name.startsWith('.') &&
          IMAGE_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())
      )
      .map((entry) => `/images/${entry.name}`)
      .sort((a, b) => a.localeCompare(b));

    res.status(200).json({ data: images });
  } catch {
    res.status(500).json({ error: 'Failed to list images.' });
  }
});

export default router;

import { Router } from 'express';
import { readdir } from 'fs/promises';
import { mkdirSync } from 'fs';
import path from 'path';
import multer from 'multer';
import type { Request, Response } from 'express';

const IMAGE_EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.avif'];
const IMAGE_MIMETYPES = ['image/webp', 'image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/gif', 'image/avif'];

const projectRoot = path.join(__dirname, '..', '..');
const imageDir = path.join(projectRoot, 'public', 'images');

mkdirSync(imageDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, imageDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_ -]/g, '').replace(/\s+/g, ' ').trim();
      cb(null, `${Date.now()}-${base || 'image'}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMAGE_MIMETYPES.includes(file.mimetype) && IMAGE_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported image type.'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const dir = path.join(projectRoot, 'public', 'images');
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

router.post('/upload', upload.single('image'), (req: Request, res: Response) => {
  const file = (req as any).file;
  if (!file) {
    return res.status(400).json({ error: 'No image file provided.' });
  }
  const imagePath = `/images/${file.filename}`;
  res.status(201).json({ data: imagePath });
});

export default router;

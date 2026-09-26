import { Router } from 'express';
import { readdir } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import pool from '../lib/mysql';

const IMAGE_EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.avif'];
const IMAGE_MIMETYPES = ['image/webp', 'image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/gif', 'image/avif'];

const projectRoot = path.join(__dirname, '..', '..');
const imageDir = path.join(projectRoot, 'public', 'images');

mkdirSync(imageDir, { recursive: true });

const upload = multer({
  // Uploaded bytes go into the `images` table, not the filesystem: committed
  // artwork ships inside the Docker image, so anything written to public/ at
  // runtime would vanish on the next deploy anyway.
  storage: multer.memoryStorage(),
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

function sanitizeBase(name: string) {
  return name.replace(/[^a-zA-Z0-9_ -]/g, '').replace(/\s+/g, ' ').trim();
}

// Filenames double as the public URL (/images/<name>), so an upload must not
// collide with a committed file on disk or a row already in the table.
async function pickFilename(base: string, ext: string): Promise<string> {
  let candidate = `${base}${ext}`;
  for (let i = 2; ; i++) {
    const [rows] = await pool.query('SELECT id FROM images WHERE filename = ? LIMIT 1', [candidate]);
    if (!(rows as any[]).length && !existsSync(path.join(imageDir, candidate))) return candidate;
    candidate = `${base}-${i}${ext}`;
  }
}

// Mounted at /images/:name in server.ts, after express.static: a committed
// file on disk wins, and the table is the fallback for uploaded artwork.
export async function serveStoredImage(req: Request, res: Response) {
  try {
    const [rows] = await pool.query(
      'SELECT mime_type, data FROM images WHERE filename = ? LIMIT 1',
      [req.params.name]
    );
    const row = (rows as any[])[0];
    if (!row) return res.status(404).end();
    res.setHeader('Content-Type', row.mime_type);
    res.setHeader('Content-Length', String(row.data.length));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(row.data);
  } catch {
    res.status(500).json({ error: 'Failed to load image.' });
  }
}

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const entries = await readdir(imageDir, { withFileTypes: true });
    const [rows] = await pool.query('SELECT filename FROM images');

    const onDisk = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          !entry.name.startsWith('.') &&
          IMAGE_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())
      )
      .map((entry) => entry.name);
    const inDb = (rows as any[]).map((row) => row.filename as string);

    const images = [...new Set([...onDisk, ...inDb])]
      .map((name) => `/images/${name}`)
      .sort((a, b) => a.localeCompare(b));

    res.status(200).json({ data: images });
  } catch {
    res.status(500).json({ error: 'Failed to list images.' });
  }
});

// multer reports failures (oversized file, rejected type) via next(err); map
// them to a real status instead of the generic 500.
function uploadSingle(req: Request, res: Response, next: NextFunction) {
  upload.single('image')(req, res, (err: any) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.message });
    }
    return res.status(400).json({ error: err?.message || 'Upload failed.' });
  });
}

router.post('/upload', uploadSingle, async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No image file provided.' });
  }
  try {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = sanitizeBase(path.basename(file.originalname, ext)) || 'image';
    const filename = await pickFilename(base, ext);
    await pool.query(
      'INSERT INTO images (filename, mime_type, data, size_bytes) VALUES (?, ?, ?, ?)',
      [filename, file.mimetype, file.buffer, file.size]
    );
    res.status(201).json({ data: `/images/${filename}` });
  } catch (err: any) {
    console.error('[POST /api/images/upload]', err);
    // The blob goes over the wire in a single packet; MySQL rejects it when it
    // exceeds max_allowed_packet (XAMPP ships with 1MB, MySQL 8 defaults to 64MB).
    if (err?.code === 'ER_NET_PACKET_TOO_LARGE') {
      return res.status(413).json({
        error: 'Image is too large for the database. Use a smaller file or raise MySQL max_allowed_packet.',
      });
    }
    res.status(500).json({ error: 'Failed to save image.' });
  }
});

export default router;

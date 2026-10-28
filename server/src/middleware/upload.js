import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import env from '../config/env.js';

fs.mkdirSync(env.uploadRoot, { recursive: true });

const ALLOWED = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

export const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, env.uploadRoot),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(24).toString('hex') + '.bin'), // random name; never user-controlled
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ALLOWED[ext] && ALLOWED[ext] === file.mimetype) return cb(null, true);
    cb(Object.assign(new Error('Only PDF, PNG or JPEG files are allowed'), { name: 'MulterError', code: 'LIMIT_UNEXPECTED_FILE', status: 400 }));
  },
});

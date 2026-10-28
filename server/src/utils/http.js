import { ZodError } from 'zod';
import { badRequest } from './errors.js';

// Wrap a handler: returns { ok:true, data } and forwards errors to the central handler.
// A handler may return paged(data, meta) to include pagination metadata.
export const h = (fn, status = 200) => async (req, res, next) => {
  try {
    const out = await fn(req, res);
    if (res.headersSent) return;
    if (out && out.__meta) return res.status(status).json({ ok: true, data: out.data, meta: out.__meta });
    res.status(status).json({ ok: true, data: out === undefined ? null : out });
  } catch (err) {
    next(err);
  }
};

export const paged = (data, meta) => ({ __meta: meta, data });

// Parse with a zod schema; converts failures into a 400 with field messages.
export function parse(schema, input) {
  try {
    return schema.parse(input);
  } catch (e) {
    if (e instanceof ZodError) {
      throw badRequest('Please check the highlighted fields', e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    }
    throw e;
  }
}

export function pageParams(query, defaultSize = 20, max = 100) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(max, Math.max(1, parseInt(query.pageSize, 10) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
export const pageMeta = (p, total) => ({ page: p.page, pageSize: p.pageSize, total, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) });

import { z } from 'zod';

export const email = z.string().trim().toLowerCase().email().max(254);
export const password = z.string().min(10, 'Use at least 10 characters').max(128)
  .regex(/[A-Za-z]/, 'Include at least one letter').regex(/\d/, 'Include at least one number');
export const shortText = (max = 200) => z.string().trim().min(1).max(max);
export const optText = (max = 200) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));
export const optUrl = z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'Must start with http:// or https://').optional().or(z.literal('').transform(() => undefined));
export const phone = z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number').optional().or(z.literal('').transform(() => undefined));
export const id = z.string().min(1).max(40);
export const dateStr = z.coerce.date();
export const year = z.coerce.number().int().min(1990).max(2100);

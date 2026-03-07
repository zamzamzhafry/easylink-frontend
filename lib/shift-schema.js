import { z } from 'zod';

const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const nullableTimeSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    const raw = value == null ? '' : String(value).trim();
    return raw ? raw : null;
  })
  .refine((value) => value === null || timeRegex.test(value), {
    message: 'Time must use HH:mm or HH:mm:ss format.',
  });

const nullableNumberSchema = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  })
  .refine((value) => value === null || !Number.isNaN(value), {
    message: 'Work hours must be a number.',
  })
  .refine((value) => value === null || (value >= 0 && value <= 24), {
    message: 'Work hours must be between 0 and 24.',
  });

const nullableStringSchema = (max) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      const text = value == null ? '' : String(value).trim();
      return text ? text : null;
    })
    .refine((value) => value === null || value.length <= max, {
      message: `Maximum ${max} characters.`,
    });

export const shiftPayloadSchema = z
  .object({
    nama_shift: z
      .string({ required_error: 'Shift name is required.' })
      .trim()
      .min(2, 'Shift name is too short.')
      .max(50, 'Shift name is too long.'),
    jam_masuk: nullableTimeSchema,
    jam_keluar: nullableTimeSchema,
    next_day: z.coerce.boolean().default(false),
    is_paid: z.coerce.boolean().default(true),
    jam_kerja: nullableNumberSchema,
    color_hex: z
      .string()
      .trim()
      .regex(hexColorRegex, 'Color must use #RRGGBB format.')
      .default('#6B7280'),
    needs_scan: z.coerce.boolean().default(true),
    icon_key: nullableStringSchema(30),
    is_active: z.coerce.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.needs_scan && (!value.jam_masuk || !value.jam_keluar)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Scan-required shift must include both in and out times.',
        path: ['jam_masuk'],
      });
    }
  });

export function normalizeTimeDb(value) {
  if (!value) return null;
  return value.length === 5 ? `${value}:00` : value;
}


import { z } from 'zod';

export const LanguageSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameLocal: z.string().optional().nullable(),
  script: z.string().optional().nullable(),
  scriptCode: z.string().optional().nullable(),
  scriptDirection: z.string().optional().nullable(),
  ldml: z.string().optional().nullable(),
  rod: z.number().optional().nullable(),
  iso6393: z.string().optional().nullable(),
}).passthrough();

export const CountrySchema = z.object({
  id: z.string(),
  name: z.string(),
  nameLocal: z.string().optional().nullable(),
}).passthrough();

/**
 * FUMS (Fair Use Management System) analytics metadata.
 *
 * api.bible returns this alongside responses so usage can be reported back for
 * fair-use tracking. Current responses populate `fumsToken` — the value you
 * submit when reporting usage — and nothing else; the remaining fields belong
 * to the older JavaScript-embed flow and are frequently absent. Any field not
 * listed here is still preserved, since the schema is `.passthrough()`.
 */
export const MetaSchema = z.object({
  fumsToken: z.string().optional(),
  fumsId: z.string().optional(),
  fums: z.string().optional(),
  fumsJsInclude: z.string().optional(),
  fumsJs: z.string().optional(),
}).passthrough();

export type Meta = z.infer<typeof MetaSchema>;

// Accepts a plain string (html/text content types) or an array of passthrough
// objects (json content type) — the API returns either depending on contentType.
export const ContentNodeSchema = z.object({}).passthrough();
export const ContentFieldSchema = z.union([z.string(), z.array(ContentNodeSchema)]);
export type ContentNode = z.infer<typeof ContentNodeSchema>;

// Factory used by resource modules to build their per-resource envelope schemas.
// Call once at module load, not on every request.
export function apiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    meta: MetaSchema.optional(),
  }).passthrough();
}

export type ApiResponse<T> = {
  data: T;
  meta?: Meta;
};

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

export const MetaSchema = z.object({
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

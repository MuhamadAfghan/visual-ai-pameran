import { z } from "zod";

export const pageSchema = z.coerce.number().int().positive().default(1);

export const idParamSchema = z.object({ id: z.string().min(1) });

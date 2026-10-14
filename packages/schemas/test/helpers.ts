import assert from "node:assert/strict";
import { z } from "zod";

export const ok = (schema: z.ZodType, v: unknown) => {
  const r = schema.safeParse(v);
  assert.ok(r.success, r.success ? "" : z.prettifyError(r.error));
};
export const bad = (schema: z.ZodType, v: unknown) => assert.equal(schema.safeParse(v).success, false);

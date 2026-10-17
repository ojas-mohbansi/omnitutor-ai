import { z } from "zod";
import { Citation } from "./citation";
import { Coverage } from "./common";
import { TutorBlock } from "./tutor";

/** POST /api/eval/answer: tutor answer without a learner (no history, no mastery update). */
export const EvalAnswerRequest = z.object({ question: z.string().trim().min(1) });
export type EvalAnswerRequest = z.infer<typeof EvalAnswerRequest>;

export const EvalAnswerResponse = z.object({
  answer: z.string(), // all block texts joined
  blocks: z.array(TutorBlock), // the same answer with origin labels: faithfulness applies to material blocks
  contexts: z.array(z.string()), // retrieved chunk texts, for RAGAS
  citations: z.array(Citation),
  refused: z.boolean(),
  coverage: Coverage,
  topScore: z.number().min(-1).max(1), // best retrieval cosine
});
export type EvalAnswerResponse = z.infer<typeof EvalAnswerResponse>;

// ── Test set (tools/eval/testset.json) ──

export const ExpectedLocation = z.discriminatedUnion("sourceType", [
  z.object({ sourceType: z.literal("PDF"), filename: z.string(), page: z.number().int().positive() }),
  z.object({ sourceType: z.literal("PPTX"), filename: z.string(), slide: z.number().int().positive() }),
  z
    .object({ sourceType: z.literal("VIDEO"), filename: z.string(), tStart: z.number().min(0), tEnd: z.number().min(0) })
    .refine((l) => l.tEnd >= l.tStart, { message: "tEnd must be >= tStart", path: ["tEnd"] }),
]);
export type ExpectedLocation = z.infer<typeof ExpectedLocation>;

export const TestSetItem = z
  .object({
    id: z.string().min(1),
    question: z.string().min(1),
    modality: z.enum(["pdf", "pptx", "video", "off_material"]),
    needsFigure: z.boolean(), // answer depends on a diagram/figure
    groundTruth: z.string(), // reference answer ("" for off_material)
    expected: z.array(ExpectedLocation), // where the answer lives; [] for off_material
  })
  .superRefine((t, ctx) => {
    const off = t.modality === "off_material";
    if (off && t.expected.length > 0) ctx.addIssue({ code: "custom", message: "off_material items have no expected locations", path: ["expected"] });
    if (!off && t.expected.length === 0) ctx.addIssue({ code: "custom", message: "answerable items need ≥ 1 expected location", path: ["expected"] });
  });
export type TestSetItem = z.infer<typeof TestSetItem>;

export const TestSet = z
  .array(TestSetItem)
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, { message: "duplicate test ids" });
export type TestSet = z.infer<typeof TestSet>;

/** Target composition from the plan. Returns unmet requirements ([] = complete). */
export function testSetGaps(items: TestSetItem[]): string[] {
  const count = (m: TestSetItem["modality"]) => items.filter((i) => i.modality === m).length;
  const gaps: string[] = [];
  for (const m of ["pdf", "pptx", "video"] as const) if (count(m) < 5) gaps.push(`${m}: ${count(m)}/5`);
  if (count("off_material") < 5) gaps.push(`off_material: ${count("off_material")}/5`);
  const figures = items.filter((i) => i.needsFigure).length;
  if (figures < 2) gaps.push(`needsFigure: ${figures}/2`);
  return gaps;
}

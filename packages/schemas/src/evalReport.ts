import { z } from "zod";
import { Coverage, IsoDate } from "./common";

// Evaluation reports (Module 19). Written by `npm run eval:rag` and `npm run eval:sim` into data/eval/,
// served read-only by GET /api/eval/report. A number appears only if a script measured it: `null` means
// "no data" (e.g. nothing answered in that slice), never a default or an estimate.

/** A rate or score in [0, 1]; null = no data. */
const Rate = z.number().min(0).max(1).nullable();
/** Cosine similarity in [-1, 1]; null = no data. */
const Cos = z.number().min(-1).max(1).nullable();

export const RagMetrics = z.object({
  faithfulness: Rate, // supported claims / claims, over MATERIAL blocks (RAGAS faithfulness)
  faithfulnessAll: Rate, // the same over the whole answer, outside blocks included
  answerRelevancy: Cos, // mean cosine(question, questions generated from the answer) (RAGAS answer relevancy)
  contextPrecision: Rate, // rank-weighted share of relevant retrieved contexts (RAGAS context precision)
  contextRecall: Rate, // reference statements attributable to the contexts (RAGAS context recall)
  citationAccuracy: Rate, // answered questions citing at least one expected page/slide/time range (code-checked)
});
export type RagMetrics = z.infer<typeof RagMetrics>;

export const RagSlice = RagMetrics.extend({ questions: z.number().int().min(0), answered: z.number().int().min(0) });
export type RagSlice = z.infer<typeof RagSlice>;

export const RagRow = z.object({
  id: z.string(),
  set: z.string(),
  modality: z.enum(["pdf", "pptx", "video", "off_material"]),
  question: z.string(),
  expected: z.array(z.string()), // human-readable locations, e.g. "deck.pptx s.6"
  cited: z.array(z.string()),
  refused: z.boolean(),
  coverage: Coverage,
  topScore: z.number().min(-1).max(1),
  citationCorrect: z.boolean().nullable(), // null: not applicable (off-material or declined)
  faithfulness: Rate,
  answerRelevancy: Cos,
  contextPrecision: Rate,
  contextRecall: Rate,
  claims: z.number().int().min(0).nullable(),
});
export type RagRow = z.infer<typeof RagRow>;

export const RagReport = z.object({
  ranAt: IsoDate,
  models: z.object({ tutor: z.string(), judge: z.string(), embed: z.string() }),
  testSets: z.array(z.object({ name: z.string(), questions: z.number().int().min(0) })),
  counts: z.object({ questions: z.number().int(), answerable: z.number().int(), offMaterial: z.number().int(), answered: z.number().int() }),
  overall: RagMetrics.extend({
    refusalRecall: Rate, // off-material questions declined / off-material questions
    refusalPrecision: Rate, // off-material among all declines
    falseRefusalRate: Rate, // answerable questions wrongly declined
  }),
  byModality: z.object({ pdf: RagSlice, pptx: RagSlice, video: RagSlice }),
  bySet: z.record(z.string(), RagSlice),
  rows: z.array(RagRow),
  geminiRequests: z.object({ generate: z.number().int().min(0), embed: z.number().int().min(0) }),
});
export type RagReport = z.infer<typeof RagReport>;

export const SimRow = z.object({
  profile: z.string(),
  policy: z.enum(["adaptive", "random"]),
  gain: z.number().min(0).max(1), // share of topics truly learned during the run
  gainSd: z.number().min(0),
  maeFirst: z.number().min(0).max(1), // |estimated mastery − true knowledge|, after session 1
  maeLast: z.number().min(0).max(1), // … after the last session
  repetition: z.number().min(0).max(1), // share of asked questions the student had already seen
});
export type SimRow = z.infer<typeof SimRow>;

export const SimReport = z.object({
  ranAt: IsoDate,
  params: z.object({
    sessions: z.number().int().positive(),
    questionsPerSession: z.number().int().positive(),
    studentsPerProfile: z.number().int().positive(),
    itemsPerTopic: z.number().int().positive(),
    simulatedStudent: z.record(z.string(), z.unknown()),
    appModel: z.record(z.string(), z.unknown()),
  }),
  topics: z.array(z.string()),
  rows: z.array(SimRow),
  overall: z.object({
    adaptive: z.object({ gain: z.number(), repetition: z.number() }),
    random: z.object({ gain: z.number(), repetition: z.number() }),
  }),
});
export type SimReport = z.infer<typeof SimReport>;

/** GET /api/eval/report: the latest reports (null = not run yet), plus any report that failed validation. */
export const EvalReportView = z.object({ rag: RagReport.nullable(), sim: SimReport.nullable(), problems: z.array(z.string()) });
export type EvalReportView = z.infer<typeof EvalReportView>;

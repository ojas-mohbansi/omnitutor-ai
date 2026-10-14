import { z } from "zod";
import { Citation } from "./citation";
import { AssessmentKind, Count, Id, IsoDate, Probability, QuestionType } from "./common";

export const Difficulty = z.number().int().min(1).max(3); // 1 easy · 2 medium · 3 hard

/** POST /api/quiz. DIAGNOSTIC = 1 per topic; MOCK = all topics, 10 questions; QUIZ = chosen topics. */
export const CreateQuizRequest = z
  .object({
    learnerId: Id,
    courseId: Id.optional(),
    kind: AssessmentKind,
    topicIds: z.array(Id).min(1).optional(),
    count: z.number().int().min(1).max(20).optional(),
  })
  .refine((r) => r.kind !== "QUIZ" || (r.topicIds?.length ?? 0) > 0, {
    message: "QUIZ requires topicIds",
    path: ["topicIds"],
  });
export type CreateQuizRequest = z.infer<typeof CreateQuizRequest>;

// Client-safe question: never contains the answer, explanation or misconception labels.
// (Zod strips unknown keys, so parsing a full DB row through this drops them.)
const QuestionBase = z.object({
  id: Id,
  position: Count,
  topicId: Id,
  topicName: z.string(),
  difficulty: Difficulty,
  stem: z.string().min(1),
});
export const QuizQuestion = z.discriminatedUnion("type", [
  QuestionBase.extend({ type: z.literal("MCQ"), options: z.array(z.string().min(1)).min(2).max(6) }),
  QuestionBase.extend({ type: z.literal("NUMERIC"), unit: z.string().nullable() }),
  QuestionBase.extend({ type: z.literal("SHORT") }),
]);
export type QuizQuestion = z.infer<typeof QuizQuestion>;

/** POST /api/quiz and GET /api/quiz/[id] */
export const Quiz = z.object({
  assessmentId: Id,
  kind: AssessmentKind,
  createdAt: IsoDate,
  questions: z.array(QuizQuestion).min(1),
});
export type Quiz = z.infer<typeof Quiz>;

export const QuizResponse = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MCQ"), index: z.number().int().min(0) }),
  z.object({ type: z.literal("NUMERIC"), value: z.number().finite() }),
  z.object({ type: z.literal("SHORT"), text: z.string().trim().max(2000) }),
]);
export type QuizResponse = z.infer<typeof QuizResponse>;

/** POST /api/quiz/[id]/submit. Unanswered questions may be omitted (graded as wrong). */
export const SubmitRequest = z
  .object({
    responses: z.array(z.object({ questionId: Id, response: QuizResponse })),
  })
  .refine((r) => new Set(r.responses.map((x) => x.questionId)).size === r.responses.length, {
    message: "duplicate questionId in responses",
    path: ["responses"],
  });
export type SubmitRequest = z.infer<typeof SubmitRequest>;

export const Feedback = z.object({ text: z.string().min(1), citations: z.array(Citation) });
export type Feedback = z.infer<typeof Feedback>;

export const AttemptResult = z
  .object({
    questionId: Id,
    position: Count,
    topicId: Id,
    type: QuestionType,
    stem: z.string(),
    options: z.array(z.string().min(1)).nullable(), // MCQ options (to show the chosen one); null otherwise
    response: QuizResponse.nullable(), // null = unanswered
    correct: z.boolean(),
    score: Probability, // partial credit for SHORT
    correctAnswer: z.string(), // display form, e.g. "17 ms" or the correct option text
    feedback: Feedback, // cites the source excerpts the question came from
    misconception: z.string().nullable(),
  })
  .superRefine((a, ctx) => {
    if ((a.type === "MCQ") !== (a.options !== null)) {
      ctx.addIssue({ code: "custom", message: "options must be set for MCQ and null otherwise", path: ["options"] });
    }
    if (a.response && a.response.type !== a.type) {
      ctx.addIssue({ code: "custom", message: "response.type must match the question type", path: ["response"] });
    }
  });
export type AttemptResult = z.infer<typeof AttemptResult>;

export const TopicResult = z.object({
  topicId: Id,
  topicName: z.string(),
  correct: Count,
  total: Count,
  masteryBefore: Probability,
  masteryAfter: Probability,
});
export type TopicResult = z.infer<typeof TopicResult>;

export const MisconceptionSummary = z.object({
  label: z.string().min(1),
  topicId: Id,
  topicName: z.string(),
  count: z.number().int().min(1),
});
export type MisconceptionSummary = z.infer<typeof MisconceptionSummary>;

/** POST /api/quiz/[id]/submit and GET /api/quiz/[id]/report */
export const QuizReport = z.object({
  assessmentId: Id,
  kind: AssessmentKind,
  submittedAt: IsoDate,
  score: z.object({ correct: Count, total: Count }),
  perTopic: z.array(TopicResult),
  misconceptions: z.array(MisconceptionSummary),
  revisit: z.array(Citation), // "go back and read this" for weak topics
  attempts: z.array(AttemptResult),
});
export type QuizReport = z.infer<typeof QuizReport>;

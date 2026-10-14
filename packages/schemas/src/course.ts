import { z } from "zod";
import { Citation } from "./citation";
import { Count, Id, IsoDate, SourceStatus, SourceType } from "./common";

// ── Sources ──

/** Canonical MIME type stored and served per source type. */
export const ACCEPTED_UPLOADS: Record<SourceType, string[]> = {
  PDF: ["application/pdf"],
  PPTX: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  VIDEO: ["video/mp4"],
};
/** The file extension decides the type (browser MIME types are unreliable); the server then checks the content. */
export const ACCEPTED_EXTENSIONS: Record<SourceType, string> = { PDF: ".pdf", PPTX: ".pptx", VIDEO: ".mp4" };
export const MAX_VIDEO_MINUTES = 20;
export const MAX_UPLOAD_MB = 500;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** "Lecture 5.PDF" → "PDF"; unsupported or missing extension → null. */
export function sourceTypeFromFilename(filename: string): SourceType | null {
  const ext = /\.[^./\\]+$/.exec(filename.trim().toLowerCase())?.[0];
  const match = (Object.keys(ACCEPTED_EXTENSIONS) as SourceType[]).find((t) => ACCEPTED_EXTENSIONS[t] === ext);
  return match ?? null;
}

/** POST /api/sources?filename=…, with the raw file bytes as the body (no multipart). */
export const UploadQuery = z.object({ filename: z.string().trim().min(1).max(255) });
export type UploadQuery = z.infer<typeof UploadQuery>;

export const SourceView = z.object({
  id: Id,
  type: SourceType,
  filename: z.string(),
  status: SourceStatus,
  error: z.string().nullable(),
  progressDone: Count, // poll GET /api/sources until READY or FAILED
  progressTotal: Count,
  chunkCount: Count,
  createdAt: IsoDate,
});
export type SourceView = z.infer<typeof SourceView>;

/**
 * POST /api/sources → status PENDING (stored; no Gemini usage yet).
 * POST /api/sources/[id]/ingest → status PROCESSING (ingestion started; poll GET /api/sources).
 */
export const UploadResponse = z.object({ id: Id, status: SourceStatus });
export type UploadResponse = z.infer<typeof UploadResponse>;

/** DELETE /api/sources/[id]: removes the source, its chunks and the stored file. 409 while PROCESSING. */
export const DeleteSourceResponse = z.object({ id: Id });
export type DeleteSourceResponse = z.infer<typeof DeleteSourceResponse>;

// ── Topics / course build ──

/** A concept (subtopic) inside a topic: aggregated from the concept labels ingestion gave its chunks, with where it is taught. */
export const TopicConcept = z.object({
  label: z.string().min(1),
  chunkCount: Count,
  citations: z.array(Citation).max(2),
});
export type TopicConcept = z.infer<typeof TopicConcept>;

export const TopicView = z.object({
  id: Id,
  seq: Count, // display order, roughly prerequisite order
  name: z.string().min(1),
  description: z.string(),
  prereqIds: z.array(Id),
  chunkCount: Count,
  concepts: z.array(TopicConcept).max(8), // most-taught first
});
export type TopicView = z.infer<typeof TopicView>;

/**
 * POST /api/build. Rebuilding replaces the course's topics, which erases learner progress on them
 * (mastery, quiz questions). If any exists, the build is refused (409) unless `force` is true (decision Q9).
 */
export const BuildRequest = z.object({ courseId: Id.optional(), force: z.boolean().optional() });
export type BuildRequest = z.infer<typeof BuildRequest>;

/** Query for course-scoped GETs (?courseId=…); omitted = the default course. */
export const CourseQuery = z.object({ courseId: Id.optional() });
export type CourseQuery = z.infer<typeof CourseQuery>;

export const BuildResponse = z.object({ topics: z.array(TopicView) });
export type BuildResponse = z.infer<typeof BuildResponse>;

// ── Learners (no auth; picker in the header) ──

export const Learner = z.object({ id: Id, name: z.string(), createdAt: IsoDate });
export type Learner = z.infer<typeof Learner>;

export const CreateLearnerRequest = z.object({ name: z.string().trim().min(1).max(60) });
export type CreateLearnerRequest = z.infer<typeof CreateLearnerRequest>;

/** Query for learner-scoped GETs (?learnerId=…). Unknown learner → 404. */
export const LearnerQuery = z.object({ learnerId: Id });
export type LearnerQuery = z.infer<typeof LearnerQuery>;

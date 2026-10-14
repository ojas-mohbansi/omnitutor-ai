# Delivery Plan and Demo

> **Status: early design proposal, not the implemented system (audited 2026-10-14).**
> This note predates the build and describes options that were **not** adopted, e.g. pgvector,
> PostgreSQL full-text/hybrid search and per-course authorization. The implemented architecture is
> [ARCHITECTURE.md](ARCHITECTURE.md) (deviations from the plan: its §0) and the API is [API_SPEC.md](API_SPEC.md).
> Kept for reference only.


## Workstreams

### Platform foundation
- Turborepo workspace, Next.js web app, Node.js worker
- Authentication and course access controls
- PostgreSQL, Prisma migrations, pgvector extension
- Upload storage and job lifecycle

### PostgreSQL RAG knowledge base
- PDF/textbook extraction
- Slide text, diagram, and table extraction
- Video audio extraction, ASR, and frame sampling
- Stable source units with page/slide/timestamp provenance
- Chunking, embeddings, full-text indexing, hybrid retrieval
- Citation validation and unsupported-query refusal

### Tutor and audio
- Source-grounded chat
- Source viewer links
- Speech input and synthesized speech output
- Transcript display and audio failure handling

### Assessment and personalization
- MCQ, short-answer, and numerical generation
- Source/answer verification
- Duplicate detection
- Cited feedback and post-assessment analysis
- BKT or another documented learner model
- Cold-start diagnostic and revision suggestions

### Evaluation and demo
- Versioned course test set with source locations
- Retrieval/generation benchmark
- Simulated learner profiles across sessions
- Honest results report and failure analysis
- 3–10 minute demonstration video

## Recommended implementation order

1. Monorepo, auth, database, upload and job lifecycle.
2. Extraction with stable source locations.
3. PostgreSQL FTS + pgvector retrieval.
4. Grounded answers, citations, and abstention.
5. Video/audio ingestion and audio tutoring.
6. Assessment generation, verification, and novelty.
7. Learner events, mastery estimates, diagnostic flow.
8. Evaluation, dashboard polish, and demo recording.

This order is a dependency suggestion, not a calendar promise.

## Definition of done

- Server inputs are validated.
- Authorization is enforced at the data layer.
- Provenance survives extraction, chunking, retrieval, and generation.
- Tests cover failure and negative cases.
- Metrics and logs are available without leaking secrets.
- Documentation reflects the actual implementation.
- No paid API is required for the core demonstration.

## Hackathon judging alignment

The Track D brief assigns:
- Knowledge Base & Grounding — 20%
- Assessment Quality — 15%
- Personalization Effectiveness — 20%
- UX & Demo Video — 15%
- System Evaluation — 15%
- Technical Implementation — 15%

Grounding is a top-priority acceptance area. Demonstrate source accuracy and abstention, not just a fluent answer.

## Demo script

1. Upload a textbook PDF, a slide deck containing a diagram, and a lecture video.
2. Show ingestion progress and topic extraction.
3. Ask a course-grounded question and open the exact citation.
4. Ask an off-material question and show the unsupported-evidence response.
5. Ask a spoken question; show transcript, grounded response, citations, and audio output.
6. Generate a quiz with more than one question type.
7. Submit answers and inspect cited feedback and weak topics.
8. Show mastery changes across simulated sessions.
9. Show benchmark methodology and actual results, including limitations.

## Release blockers

- Retrieval can return data from another course.
- Unsupported questions receive fabricated course-grounded answers.
- Citations fail to open exact locations.
- Audio/video source timestamps are lost.
- Assessment answer keys leak before submission.
- Evaluation targets are presented as measured results.

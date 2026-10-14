# Technical Design — PostgreSQL RAG and Learning Algorithms

> **Status: early design proposal, not the implemented system (audited 2026-10-14).**
> This note predates the build and describes options that were **not** adopted, e.g. pgvector,
> PostgreSQL full-text/hybrid search and per-course authorization. The implemented architecture is
> [ARCHITECTURE.md](ARCHITECTURE.md) (deviations from the plan: its §0) and the API is [API_SPEC.md](API_SPEC.md).
> Kept for reference only.


## 1. RAG is mandatory

Every question about uploaded course content must pass through retrieval. The baseline stack is PostgreSQL full-text search plus `pgvector`, followed by evidence assembly, answerability checks, grounded generation, and citation validation. A separate vector database is deliberately excluded to keep the system lean.

## 2. Chunking and provenance

Each chunk should retain:
- `courseId`, `assetId`, `sourceUnitId`
- modality and source-unit type
- extracted text and optional figure/table description
- page number, slide number, timestamp range, or bounding box
- topic/concept tags
- parser/model/pipeline version
- embedding model identifier and dimensions
- quality warnings

Use structure-aware chunking: preserve headings and nearby context, avoid crossing source boundaries, and keep chunk IDs stable for a fixed source/pipeline version. A chunk is a retrieval unit; the source unit is the user-facing citation target.

## 3. PostgreSQL retrieval

Run lexical and vector retrieval in parallel, filter by authorized course IDs, then merge/rerank the candidate set.

### Lexical search
Use PostgreSQL `tsvector`/`tsquery` and a GIN index. Lexical search is useful for exact terminology, identifiers, equations, and names.

### Vector search
Use the `pgvector` extension and a vector column whose dimension matches the selected embedding model. Exact cosine-distance search is the simplest initial baseline; add approximate indexes only after measuring latency and recall on realistic data.

Illustrative SQL (adapt column/table names to the actual migration):

```sql
SELECT
  c.id,
  c.source_unit_id,
  c.content,
  1 - (c.embedding <=> $1::vector) AS cosine_similarity
FROM retrieval_chunks AS c
WHERE c.course_id = ANY($2::text[])
ORDER BY c.embedding <=> $1::vector
LIMIT $3;
```

Illustrative lexical query:

```sql
SELECT id, source_unit_id, content,
       ts_rank(search_vector, websearch_to_tsquery('english', $1)) AS rank
FROM retrieval_chunks
WHERE course_id = ANY($2::text[])
  AND search_vector @@ websearch_to_tsquery('english', $1)
ORDER BY rank DESC
LIMIT $3;
```

Use parameterized queries. The SQL is illustrative; ensure Prisma/raw SQL integration safely binds parameters and maps IDs/types correctly.

### Hybrid candidate fusion
Normalize ranks and use reciprocal-rank fusion or an evaluated weighted merge. Avoid adding raw cosine similarity and `ts_rank` without normalization because their scales differ.

\[
\operatorname{RRF}(d)=\sum_{r\in R}\frac{1}{k+\operatorname{rank}_r(d)}
\]

Choose `k`, candidate count, and final context size using the validation set. Apply course ACL filters before returning any candidate.

## 4. Grounding, citations, and refusal

Do not rely on a universal cosine threshold. Similarity depends on the embedding model, corpus, and chunking. Build labeled examples for supported, partially supported, and off-material queries; choose thresholds on validation data and report abstention precision/recall.

Response statuses:
- `SUPPORTED`
- `PARTIALLY_SUPPORTED`
- `INSUFFICIENT_EVIDENCE`
- `OUT_OF_SCOPE`
- `PROCESSING_ERROR`

The answer generator must:
- use retrieved evidence for course-specific claims
- return source IDs alongside answer claims/sections
- distinguish source-backed content from external context
- abstain or clearly qualify claims unsupported by the course corpus
- avoid inventing a page, slide, or timestamp

Citation validation must check that a source exists, belongs to the authorized course, and supports the claim. Citation presence alone is not citation correctness.

## 5. Multimodal extraction

### PDFs/textbooks
Extract text from the embedded text layer where possible; use OCR for scanned pages. Keep page number and optional bounding boxes. Link visual descriptions to the parent page and label them as derived descriptions.

### Slides
Preserve slide number, reading order, text, images, charts, and diagrams. Extract speaker notes only where permitted and relevant. A figure description must link to its original slide.

### Lecture videos
Extract audio and metadata, transcribe speech, preserve segment timestamps, and sample video frames with a documented strategy. Link transcript segments and frame descriptions to exact time ranges. Do not treat a transcript as a substitute for visual information on the slide.

### Audio tutoring
Transcribe spoken user turns, use the same retrieval and answerability path as typed chat, and synthesize answers. Display the transcript and source citations alongside audio. Measure speech recognition quality and end-to-end latency.

## 6. Assessment generation

Question types: MCQ, short answer, numerical problem.

For every candidate:
1. Validate schema.
2. Check that source evidence supports the question and answer.
3. Verify answer key; use deterministic calculation for numerical problems when possible.
4. Check MCQ has one best answer and no accidental ambiguity.
5. Validate topic/difficulty tags.
6. Compare exact normalized fingerprints and semantic similarity against prior items.
7. Publish only passing questions; retain rejection reasons for debugging.

A second model may be used as an independent verifier, but model agreement is not proof. Prefer deterministic checks when possible and route disagreements to regeneration or review.

## 7. Learner modelling

Persist observations as events and derive mastery snapshots so the model can be replayed and compared.

### Bayesian Knowledge Tracing (BKT)
Let \(P(L_t)\) denote the probability the learner knows a skill before observing response \(O_t\). Let \(P(G)\) be guess probability, \(P(S)\) slip probability, and \(P(T)\) learning transition probability.

For a correct response:

\[
P(L_t\mid O_t=\text{correct}) =
\frac{P(L_t)(1-P(S))}
{P(L_t)(1-P(S))+(1-P(L_t))P(G)}
\]

For an incorrect response:

\[
P(L_t\mid O_t=\text{incorrect}) =
\frac{P(L_t)P(S)}
{P(L_t)P(S)+(1-P(L_t))(1-P(G))}
\]

Then apply the learning transition:

\[
P(L_{t+1})=P(L_t\mid O_t)+(1-P(L_t\mid O_t))P(T)
\]

These are standard candidate equations, not calibrated parameters. Tune parameters only on representative data; otherwise label them provisional. Consider question difficulty and guessing behavior in later model iterations.

## 8. Evaluation requirements

Evaluate:
- context precision and context recall
- faithfulness and answer relevancy
- citation location accuracy and claim entailment
- abstention precision/recall
- question correctness, ambiguity, novelty, and feedback quality
- learner-profile outcomes across sessions
- transcription quality, audio completion rate, and latency

Record model versions, prompts, data split, code commit, and raw outputs. Do not claim any target has been reached before measuring it.

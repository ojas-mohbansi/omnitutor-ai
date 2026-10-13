# Glossary and Architecture Decisions

## Glossary

- **RAG:** Retrieval-augmented generation; retrieve relevant evidence before generating an answer.
- **Source unit:** Normalized source evidence tied to an exact page, slide, timestamp, or visual region.
- **Retrieval chunk:** A smaller indexed unit derived from a source unit for search.
- **Provenance:** Information identifying where source content originated.
- **Grounded answer:** An answer whose course-specific claims are supported by retrieved evidence.
- **Abstention:** Declining or qualifying a response when evidence is insufficient.
- **pgvector:** PostgreSQL extension for vector similarity search.
- **Full-text search:** PostgreSQL lexical search using `tsvector`/`tsquery`.
- **BKT:** Bayesian Knowledge Tracing, a probabilistic skill/mastery model.
- **ASR/TTS:** Automatic speech recognition / text-to-speech.
- **WER/CER:** Word/character error rate for speech transcription.
- **RRF:** Reciprocal-rank fusion for combining ranked retrieval lists.

## ADR: TypeScript-first monorepo

**Decision:** Use TypeScript, Node.js, React, Next.js App Router, and Turborepo.  
**Reason:** Shared types and a consistent development environment.  
**Trade-off:** Some media/model tooling is easier in Python; do not introduce another runtime unless a concrete capability requires it.

## ADR: PostgreSQL is the RAG store

**Decision:** Use PostgreSQL full-text search plus pgvector for the baseline retrieval system.  
**Reason:** One operational data platform reduces service count and keeps course filters, source metadata, and retrieval close together.  
**Trade-off:** Tune indexing and connection/resource use; a single database is not automatically fastest for every corpus. Benchmark before optimizing.

## ADR: RAG is mandatory

**Decision:** Every course-grounded answer passes through retrieval, evidence sufficiency, and citation validation.  
**Reason:** Grounding, citations, and refusal behavior are central to the Track D score (20% for Knowledge Base & Grounding).  
**Consequence:** No silent uncited fallback when retrieval is empty or weak.

## ADR: Audio is core

**Decision:** Audio tutoring is a required product feature.  
**Consequence:** Speech input, spoken output, transcripts, citation display, error handling, and audio evaluation are part of acceptance criteria.

## ADR: Free/FOSS-first

**Decision:** No paid API is required for the core application. Prefer open-source application components and local/self-hosted models.  
**Consequence:** Review each model/weight license independently; free download does not guarantee OSI-approved open source or unrestricted commercial use. Keep adapters replaceable.

## ADR: Calibrate refusal thresholds

**Decision:** Do not use a universal similarity threshold without evaluation.  
**Reason:** Similarity depends on model, chunking, and corpus.  
**Consequence:** Select operating thresholds on labeled validation data and report abstention precision/recall.

## ADR: Event-based learner state

**Decision:** Persist immutable learner observations and derive mastery snapshots.  
**Reason:** Supports replay, debugging, and algorithm comparisons.  
**Consequence:** Record model version and observation metadata for every event.

## Open decisions

- Which local embedding model fits corpus quality and hardware limits?
- Which local LLM supports grounded generation and assessment verification?
- Which FOSS OCR/vision model handles diagrams well?
- Which ASR and TTS models meet latency, language, and license needs?
- Should jobs initially use PostgreSQL-backed workers or a separate FOSS queue?
- Which learner-model parameters can be calibrated from the available dataset?
- Which licenses permit the intended distribution and use?

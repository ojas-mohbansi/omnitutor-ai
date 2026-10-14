# Product Requirements — OmniTutor AI

> **Status: early design proposal, not the implemented system (audited 2026-10-14).**
> This note predates the build and describes options that were **not** adopted, e.g. pgvector,
> PostgreSQL full-text/hybrid search and per-course authorization. The implemented architecture is
> [ARCHITECTURE.md](ARCHITECTURE.md) (deviations from the plan: its §0) and the API is [API_SPEC.md](API_SPEC.md).
> Kept for reference only.


## Product summary

OmniTutor AI is a multimodal study companion that combines course materials and learner state to provide trustworthy, adaptive tutoring. Retrieval-augmented generation (RAG) is mandatory: every answer about uploaded course content must be grounded in retrieved PostgreSQL records or clearly flagged as unsupported.

## Problem

Students work across disconnected textbooks, slides, figures, and lecture recordings. General chatbots may produce plausible answers that do not reflect the course content, cite no exact source location, or ignore the learner’s existing knowledge. OmniTutor AI connects course sources to explanations, assessments, and a learner model.

## Users

- Higher-education students using course materials or open courseware
- Self-directed learners organizing personal study resources
- Educators who need to inspect source extraction, question quality, and learning progress

## Functional requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| PR-01 | Ingest PDFs and textbooks without manual preprocessing | Extraction job and page-linked source units are visible |
| PR-02 | Ingest slide decks | Text, diagrams, figures, and slide provenance are retained |
| PR-03 | Ingest lecture videos | Transcript segments and visual frames retain timestamps |
| PR-04 | Extract figures, diagrams, and tables | Derived descriptions link to their original page/slide/time |
| PR-05 | Organize content into topics, concepts, and prerequisites | Source units have topic tags and prerequisite relations |
| PR-06 | Use PostgreSQL-backed RAG for grounded tutoring | Each course-material answer records retrieved source IDs |
| PR-07 | Cite source claims | Citations open exact page, slide, or timestamp |
| PR-08 | Refuse/qualify unsupported queries | Off-material questions are flagged instead of fabricated as course facts |
| PR-09 | Generate MCQ, short-answer, and numerical assessments | Assessment can be scoped by topic and difficulty |
| PR-10 | Verify questions and answer keys | Structural, source-support, and answer checks pass before publication |
| PR-11 | Reduce repeated questions | Exact and semantic duplicate checks run against assessment history |
| PR-12 | Give cited feedback | Feedback links to relevant source units |
| PR-13 | Track per-topic mastery | Learner events update topic mastery estimates |
| PR-14 | Support cold-start learners | Diagnostic assessment or intake flow establishes initial estimates |
| PR-15 | Evaluate retrieval and generation | Versioned test set reports faithfulness, relevancy, context precision/recall, citation accuracy, and abstention |
| PR-16 | Evaluate personalization | Simulated learners run across multiple sessions; mastery trends and repeats are reported |
| PR-17 | Support audio tutoring as a core feature | Learner can speak, receive spoken output, and inspect transcript/citations |
| PR-18 | Deliver a working web prototype and demo | Upload → grounded chat → quiz → mastery dashboard is demonstrable |

## Core RAG requirement

RAG is not a plug-in enhancement. The grounding score is 20% of the hackathon evaluation, and reliable source-linked answers and refusals depend on retrieval. All course-grounded answers must pass through the retrieval and evidence-sufficiency path. If retrieval fails, the model must not silently fall back to uncited course claims.

## Non-functional requirements

- Preserve provenance through every processing stage.
- Keep long ingestion and media jobs asynchronous and retryable.
- Use PostgreSQL as the source of truth and retrieval database.
- Support local/self-hosted operation without requiring paid APIs.
- Make upload and learner data private by default.
- Version models, prompts, parsers, and evaluation sets.
- Provide clear partial-failure states and accessible transcripts.
- Never present proposed metrics as measured outcomes.

## Success measures

Measure, rather than assume:
- ingestion completion by file type
- source-location accuracy and citation entailment
- retrieval context precision and recall
- answer faithfulness and relevancy
- abstention precision/recall on unsupported queries
- assessment answer-key correctness and duplicate rate
- simulated learner mastery trajectory
- audio transcription quality and end-to-end latency

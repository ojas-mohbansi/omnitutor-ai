# OmniTutor AI

**A source-grounded, multimodal adaptive learning platform** for the Multimodal AI Hackathon 2026 — Track D.

OmniTutor AI unifies textbooks, slide decks, lecture videos, diagrams, and spoken tutoring in one learning workspace. Its core is **retrieval-augmented generation (RAG) entirely within PostgreSQL**: source content, chunk metadata, embeddings, retrieval, citations, and answerability decisions stay in the PostgreSQL data layer. No separate vector database is required.

## Non-negotiable product requirements

- Multimodal ingestion for PDFs/textbooks, slide decks, and lecture videos.
- Extraction from figures, diagrams, and tables, with exact source locations.
- PostgreSQL-backed RAG for every course-grounded tutoring answer.
- Claim-level source citations that open the originating page, slide, or video timestamp.
- Explicit refusals or partial-support warnings for unsupported questions.
- Verified MCQ, short-answer, and numerical assessments with novelty checks.
- Learner modelling, cold-start diagnostics, and cited feedback.
- Audio input and spoken responses are core features, not optional add-ons.
- Evaluation on a versioned test set, including off-material queries and simulated learners.

## Technology principles

- TypeScript, Node.js, React, Next.js App Router, Turborepo
- PostgreSQL + Prisma ORM
- PostgreSQL full-text search and `pgvector` for vector similarity search
- Zod for runtime validation and shared TypeScript contracts
- Open-source/free software preferred throughout; no paid API is required by the design
- Local or self-hosted model adapters for embeddings, language generation, OCR/vision, ASR, and TTS
- A Node.js worker and a free/open-source queue option or PostgreSQL-backed job table for long-running work

**No separate Qdrant, Pinecone, or other vector database is part of this architecture.** PostgreSQL is the system of record and the retrieval store. Models may run locally or on infrastructure you control; model licenses and hardware requirements must be checked individually.

## Documentation

- [Product Requirements](docs/product-requirements.md)
- [System Architecture](docs/system-architecture.md)
- [Technical Design and RAG](docs/technical-design.md)
- [Database Schema and PostgreSQL RAG](docs/database-and-rag.md)
- [API Contracts](docs/api-contracts.md)
- [Evaluation and Benchmarks](docs/evaluation.md)
- [Development and Deployment](docs/development-deployment.md)
- [Security and Privacy](docs/security-privacy.md)
- [Delivery Plan and Demo](docs/delivery-plan.md)
- [Glossary and Decisions](docs/glossary-and-decisions.md)

## Truth in reporting

Thresholds in these documents are proposed acceptance targets, not measured results. Do not report them as achieved until the versioned evaluation suite has actually run. The hackathon brief scores Knowledge Base & Grounding at 20%, so retrieval, source-location preservation, citation correctness, and abstention are core acceptance criteria.

## Free/open-source policy

The application should work without paid model APIs. Prefer locally runnable models and self-hosted services. “Free to download” does not always mean OSI-approved open source: review each model’s license, weights terms, commercial-use limits, redistribution terms, and data policy before choosing it. The core application stack uses open-source components; exact model selection remains a documented decision.

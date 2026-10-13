# Evaluation and Benchmarking

## Objective

Demonstrate reliable multimodal retrieval, source grounding, question quality, and learner adaptation. The Track D brief explicitly asks for a team-built test set with known source locations and off-material queries. This document specifies evaluation; it does not contain measured results.

## Evaluation dataset

Each example should record:
- stable ID and dataset version
- course and source asset version
- user query
- expected answer points
- correct source-unit IDs and page/slide/timestamp
- answerability: supported, partially supported, or unsupported
- topic and difficulty
- reviewer/adjudication notes

Include scanned PDFs, text PDFs, slides with diagrams, tables, lecture speech, visual frames, and off-material questions. Split by asset/lecture to reduce leakage.

## RAG metrics

- **Context precision:** proportion of retrieved items that are relevant.
- **Context recall:** proportion of known relevant items retrieved.
- **Faithfulness:** generated claims supported by retrieved evidence.
- **Answer relevancy:** answer addresses the question.
- **Citation location accuracy:** citation opens the expected page/slide/time.
- **Citation entailment:** citation supports the claim it accompanies.
- **Abstention precision/recall:** unsupported queries are flagged and supported queries are not needlessly refused.
- **Latency:** median and tail retrieval/answer latency.
- **Modality slices:** report separately for PDF text, scanned pages, slide visuals, video transcript, and video frames.

RAGAS, DeepEval, or TruLens are optional evaluation frameworks, not runtime retrieval systems. Select a free/open-source tool whose license and dependencies fit the project, or implement the metric harness directly. Pin versions and keep raw outputs.

## Assessment metrics

- Answer-key correctness
- Evidence support rate
- MCQ ambiguity rate
- Topic/difficulty tag agreement
- Exact and semantic duplicate rate
- Feedback citation correctness
- Grading agreement with a human-reviewed sample

## Simulated learners

| Profile | Behavior | Evaluation question |
|---|---|---|
| Fast learner | Mostly correct, occasional slips | Does difficulty rise appropriately? |
| Struggling learner | Frequent errors, gradual improvement | Are prerequisite topics revisited? |
| Misconception-prone learner | Repeats a consistent misconception | Are corrective sources recommended? |
| Cold-start learner | No prior history | Is the diagnostic useful without overconfidence? |

Report mastery estimates by topic over sessions, held-out quiz performance, recommendation relevance, repeat rate, and misconception detection against simulated ground truth. Clearly label these as simulations, not evidence of real-world educational efficacy.

## Proposed targets (not results)

Initial project targets may be Faithfulness ≥ 0.92, Answer Relevancy ≥ 0.88, Context Precision ≥ 0.85, Context Recall ≥ 0.90, and repeated-question rate < 2%. These are team-selected goals, not thresholds mandated by the challenge. They are not achieved results until the test suite runs.

## Reproducibility

- [ ] Dataset license and version recorded
- [ ] Held-out split defined
- [ ] PostgreSQL, pgvector, embedding model, and model versions pinned
- [ ] Prompt and code commit hashes recorded
- [ ] Thresholds tuned only on validation data
- [ ] Raw outputs and score rationale retained
- [ ] Human review and disagreements reported
- [ ] Limitations and failed cases disclosed

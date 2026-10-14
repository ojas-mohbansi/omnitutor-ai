# Demo dataset (files not committed)

The files in this folder are gitignored (large, third-party material). Only this README is tracked. Copy them in from the dataset package (`C:\dev\data\claude_code_stage1_dataset\data\demo\`) or share them via Drive.

**Putting a file here does not process it.** Files enter the app only when uploaded (UI / Postman / `@sc/client`), and ingestion (which spends Gemini quota) only starts when explicitly requested.

## Stage-1 inventory (verified 2026-10-14)

| File | What | Checks | SHA-256 (first 16) | Role |
|---|---|---|---|---|
| `pdf/process-scheduling-9pages.pdf` | **Stage-1 ingestion file**: pages 1–8 = the original below; page 9 = Round Robin slide (Gantt chart + worked numerical), added from a screenshot | upload validator ✅ 9 pages; deterministic rebuild | `5ab4264dfd1eab2c` | Module 5 (PDF ingestion) test input |
| `pdf/process-scheduling-8pages.pdf` | Original: "CS C372 Operating Systems" lecture slides exported to PDF (720×540 pt pages) | ✅ 8 pages, text layer on all pages | `bc8047f9a4f50cd3` | Source of pages 1–8 (keep unchanged) |
| `slides/process-scheduling-10slides.pptx` | **Generated** companion deck (paraphrases the PDF); title + text box per slide | ✅ 10 slides; ⚠ **0 pictures** | `7452cbfd0048f8be` | Text-only PPTX parsing tests; replace with a real deck (with pictures) for Stage 2 |
| `video/cpu-scheduling-2min.mp4` | Animated CPU-scheduling explainer with narration (not a recorded lecture) | ✅ 154.16 s, H.264 640×360 30 fps + AAC stereo, audio throughout | `5e3d3e8044000656` | Stage 3 (video ingestion) |
| `papers/*.pdf` (7) | IIIT Nagpur CSL 207 / CSL 203 Operating Systems sessional + end-semester papers (phone photos) | ✅ valid PDFs, 1–4 pages | — | **Evaluation only, never upload** |
| `testset.stage1.json` | Stage-1 evaluation questions (from the papers + material) with expected locations | `TestSet` schema ✅ | — | Retrieval / tutor evaluation (Modules 8, 10, 15) |
| `testset.holdout.json` | **Holdout** (overfitting audit): 36 questions written after retrieval was frozen. 4 verbatim exam questions (partial coverage), 16 new answerable, 16 off-material (unrelated / same course / near-miss) | `TestSet` schema ✅ | `a7d488da8fc8fb73` | Retrieval holdout (`npm run holdout:retrieval`) |
| `holdout/pipes-c-program.pdf` | **REAL** lab handout (copy of `C:\dev\data\pdfs\C program on PIPES.pdf`): 3 A4 pages of C code | ✅ 3 pages | `20ac71c1418bb1f4` | Generalization holdout, course `holdout-pipes` |
| `pptx/os-module5-virtual-memory.pptx` | **REAL** lecture deck (copy of `C:\dev\data\pdfs\OS Module 5 Virtual Memory and File Management (1).pptx`): 40 slides, 8 pictures, no title placeholders | ✅ 40 slides | `8ab5040b010963e9` | Module 6 check, course `pptx-vm` |
| `pptx/lab2-file-system-calls.pptx` | **REAL** lab deck (copy of `C:\dev\data\OS_LAB_mohit\day1-Lab2__File_System_Calls.pptx`): 24 slides, code-heavy, 1 picture | ✅ 24 slides | `cc1bc21fa05f05a8` | Module 6 check, course `pptx-lab2` |
| `holdout/hash-tables-synthetic.mp4` | **SYNTHETIC** (built for the audit): 6 rendered slides + Windows TTS narration, 69.43 s, 1280×720. NOT a real lecture | ✅ | `c9d7780173034f0f` | Generalization holdout, course `holdout-hash` |

Smoke-test sample (separate file): `tools/smoke/fixtures/sample.mp4`, 45 s cut from the video at 25.8–70.8 s (lossless stream copy), SHA-256 `fdbf7d0e8bcfaa4d`.

## Known issues in the material (do not use as ground truth)
- **Page 9 (Round Robin slide):** the FIFO snapshot under the 2nd `P1` slot shows `P2 P3 P4`; P3 finished at t = 6, so the real queue is `[P2 P4]`. Independently simulated. The slide's headline results are **correct**: schedule P1 P2 P3 P4 P1 P2 P4 P1, avg waiting time 7.75, avg response time 3, 7 context switches.
- **Pages 4 and 9 have no text layer.** Their content exists only as images, which is intentional: it tests figure reading.
- The PDF has no worked Gantt-chart numerical except page 9. FCFS / SJF / priority pages are still needed before quiz numericals (Module 12).

## Video segment map (ffmpeg scene detection + frames)

| Seconds | On screen |
|---|---|
| 0.0–6.7 | Title "CPU Scheduling" |
| 6.7–19.4 | "Confusing CPU scheduling with process management is a classic exam pitfall…" |
| 19.4–24.6 | "1 — The Formal Definition" |
| 24.6–38.8 | Definition: an OS mechanism that selects a process from the ready queue and allocates the CPU based on a policy |
| 38.8–46.3 | "2 — Core Principles" |
| 46.3–75.2 | "How Scheduling Works": goal (CPU utilization), trigger (process changes state), method (preemptive / non-preemptive), waiting room (ready queue), impact (fairness, responsiveness) |
| 75.2–80.8 | "3 — A Simple Analogy" |
| 80.8–97.5 | Service counter illustration (clerk, waiting customers) |
| 97.5–102.3 | "4 — Decoding the Analogy" |
| 102.3–124.8 | Table: service counter → CPU, clerk → CPU scheduler, waiting customers → processes in ready queue, rule for choosing → scheduling policy, serving a customer → CPU execution |
| 124.8–132.4 | "5 — Your Exam Takeaway" |
| 132.4–154.2 | "Key Exam Points" (icons; content in narration) |

## Sources and licences
- Lecture slides (PDF pages 1–8): "CS C372 Operating Systems" course slides, provided by Parth. Licence: course material, local testing only.
- Round Robin slide (PDF page 9): screenshot provided by Parth; original source unknown. Local testing only.
- Video: provided by Parth (CPU Scheduling explainer); source/licence to be recorded.
- Question papers: IIIT Nagpur, Dept. of CSE, CSL 207 / CSL 203. Evaluation only; not redistributed.

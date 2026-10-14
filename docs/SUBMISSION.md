# Submission kit: Omnitutor (Track D)

Paste-ready Devpost text, the demo video script and the final checklist.

---

## 1. Devpost: project description

**Tagline:** A study companion that learns from your lecture video, textbook and slides, answers with citations to the exact page, slide or timestamp, and quizzes you where you are weakest.

### Inspiration
Students learn from three formats at once: a recorded lecture, a textbook chapter and the professor's slides. General chatbots answer from the internet, not from *your* course, and they can't show where an answer comes from. We wanted a tutor that only teaches from the course material, says so when it can't, and adapts to what each student actually knows.

### What it does
- **Multimodal knowledge base:** upload a PDF, a PPTX deck and an MP4 lecture with no preprocessing. Every page (including scanned pages and figures), every slide (text and pictures) and every minute of video becomes a cited excerpt.
- **Course map:** the material is organised into 5–8 topics with prerequisite links. Each topic lists its concepts, and each concept is linked to where it is taught.
- **Grounded tutor:** answers cite excerpts that open the exact PDF page, slide or video timestamp. Content from outside the material is labelled as such. Off-material questions are declined.
- **Verified adaptive quizzes:** MCQ, short-answer and numerical questions on the topics a student chooses. Each question is tagged with its topic, source and difficulty, and targets weak topics. A *second, different model* checks every answer blind before the question is shown, and numerical answers are checked in code (±1%). Questions never repeat.
- **Feedback and reports:** feedback is cited. Wrong MCQ options carry misconception labels. The post-quiz report shows the score and mastery change per topic, the misconceptions and where to revise.
- **Learner model:** per-topic mastery (Bayesian Knowledge Tracing). It is updated after every quiz answer and, with reduced weight, after tutor conversations. New learners start with a diagnostic quiz.
- **Private accounts:** each student signs in; their conversations, quizzes and mastery are private (enforced on the server with a signed session cookie; passwords hashed with scrypt).
- **Dashboard:** mastery per topic, prerequisites, weak topics with revise links, and mastery history.

### How we built it
- **Stack:** Next.js 16 + TypeScript, Postgres (Prisma), the Gemini API, Zod contracts shared by the API, UI and tests.
- **Ingestion:**
  - PDF: Gemini reads each page.
  - PPTX: exact text parsed from the slide XML, plus Gemini descriptions of pictures, 5 slides per call.
  - Video: Gemini reads 60-second windows with true timestamps.
- **Retrieval:** Gemini embeddings (768-d) with exact cosine search.
- **Tutor:** structured JSON answers (blocks marked *material* or *outside*). Server-side guards drop citations that were not retrieved, relabel uncited "material" as outside, and refuse when coverage is missing.
- **Quiz:** the generate → check → blind-verify pipeline above. The verifier is a different model from the generator.
- **Free-tier engineering:**
  - every model call goes through one wrapper with a rate limiter;
  - a deterministic on-disk cache, so re-ingesting the same file is free;
  - a usage ledger;
  - multi-key rotation on quota errors;
  - a backup model when one is overloaded.
- **Testing:** 270 unit/DB tests, 35 end-to-end API tests, a real-browser smoke test of the signed-in flow, and pre-registered acceptance checks on real course files.

### Evaluation (real data, measured)
| What | Result |
|---|---|
| Ingestion facts recovered (PDF / PPTX / video) | 47/47 · 21/21 + 15/15 · 12/12 (video timestamps off by 0.3 s on average) |
| Retrieval | correct excerpt in top 6: 100%; on 36 unseen questions, correct excerpt ranked first: 95% |
| Tutor citations correct | 97% (29/30) |
| Off-material refusal | 90% refused, 0/30 false refusals |
| RAGAS-style metrics (Gemini judge) | faithfulness 0.98 · answer relevancy 0.84 · context precision 0.86 · context recall 0.92 · refusal precision 1.00 |
| Quiz checks | 16/16; the verifier rejected 6 flawed candidates |
| Short-answer grading | 12/12 correct verdicts |
| Simulated students, adaptive vs random quizzing | mastery gain 74.4% vs 63.7% (novice), 48.4% vs 41.5% (basics); repetition 0% vs ~30%; lower estimation error |

Caveat: the simulated students use different parameters from the tutor's learner model, to avoid a self-fulfilling result.

### Challenges
- Getting citations that are *exactly* right across three formats.
- Stopping the model from inventing citations (server-side guards).
- A batched grader that misaligned answers (fixed with an answer-echo check).
- Running everything on free-tier quotas.

### Accomplishments
- Every claim in the UI is traceable to a page, slide or timestamp.
- Quiz questions are cross-checked by a second model.
- Every component was measured on real course files, not demos with sample data.

### What we learned
Grounding is mostly engineering around the model: retrieval, validation and refusal rules matter more than the prompt.

### Limitations (honest)
- Accounts are basic: no email verification or password reset; course material is shared by all accounts.
- Runs locally (no deployment, as the track allows).
- Diagrams drawn only with PowerPoint shapes lose their layout.
- Video files must be at most 20 minutes.
- Gemini is the only model provider.

### What's next
- Per-account courses and roles (teacher / student).
- Hindi/Hinglish answers.
- A visual course map.
- Spaced-repetition revision schedules.

**Built with:** nextjs, typescript, react, tailwindcss, postgresql, prisma, gemini, zod, recharts, docker

---

## 2. Demo video script (target ~6 min, English)

| Time | Show | Say |
|---|---|---|
| 0:00–0:30 | Landing page | The problem; "everything comes from your material, with exact citations". |
| 0:30–1:30 | /sources: upload PDF, PPTX, MP4 → Ready → Build topics | No preprocessing. Topics, prerequisites and cited concept chips. |
| 1:30–3:00 | /tutor | 1) A question answered from the PDF → the viewer opens that page. 2) A slide citation. 3) A video citation → the player jumps to the timestamp. 4) An off-material question → refused. Point out the "outside the material" label. |
| 3:00–4:30 | /quiz diagnostic → answer (get one wrong on purpose) → report → /dashboard | Topic, source and difficulty tags, verified badge, cited feedback, misconception label, mastery change, weak topics with revise links. |
| 4:30–5:00 | A second quiz | Targets the weak topics and no question repeats. Mention that a second model checks every answer. |
| 5:00–6:00 | README evaluation table and simulator results | RAGAS metrics, refusal and citation accuracy, adaptive vs random. End on the limitations and next steps. |

Tips:
- Create a fresh account at the start of the recording, so the diagnostic flow shows.
- Run the whole flow once before recording, so Gemini results are already cached and fast.

---

## 3. Final checklist
- [ ] `git push origin main`; open the repo while logged out to confirm the README renders and no `.env` is committed.
- [ ] Repo is **public**.
- [ ] Real full names of both teammates in the README and on Devpost.
- [ ] Demo video uploaded to YouTube (unlisted is fine), 3–10 min, English; link added to Devpost.
- [ ] Devpost: description (section 1), repo link, video link, "Built with" tags, Track D selected.
- [ ] Submit before 11:30 PM (deadline 12:00 AM, 15 Oct).

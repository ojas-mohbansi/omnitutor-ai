# OmniTutor Film — Complete Narration Script

**Total duration:** 2:30 (4395 frames at 30fps with transitions)  
**Word count:** ~295 words  
**Reading pace:** ~120 words/minute (measured documentary pace)

---

## Scene 1 — Opening (0:00–0:12, 360 frames)

"Every question a student asks travels through a system most will never see. This is OmniTutor — a knowledge base built from your own course material, designed to teach, test, and track understanding."

*Words: 37. Tone: authoritative, understated.*

---

## Scene 2 — The Interface (0:12–0:30, 540 frames)

"A student types a question into the tutor interface. Behind that text field, a Next.js application captures the request and validates it against a shared Zod contract. The entry point: POST /api/chat. One route. One purpose."

*Words: 41. Tone: precise, informative. Emphasis on 'One route. One purpose.'*

---

## Scene 3 — API Boundary (0:30–0:50, 600 frames)

"The route handler is deliberately thin. It reads the request body, verifies the session cookie, and delegates entirely to @sc/core — the domain library that contains all intelligence. The session boundary is the system's trust boundary."

*Words: 38. Tone: architectural explanation. Pause after 'session boundary is the system's trust boundary.'*

---

## Scene 4 — Core Pipeline (0:50–1:10, 600 frames)

"Inside @sc/core, the tutor function begins. The question becomes a 768-dimensional embedding via the Gemini embedding model. That vector is compared against thousands of course chunks stored in PostgreSQL — not in a vector database, but in plain floats, with cosine similarity computed directly in TypeScript. The top six chunks are retrieved."

*Words: 52. Tone: technical, detailed. Emphasis on 'not in a vector database.'*

---

## Scene 5 — Intelligence Pipeline (1:10–1:38, 840 frames)

"A single structured call reaches the Gemini model. It arrives with the student's retrieved excerpts, their personalized learning profile — tone, explanation style, mastery level — and the conversation history. The model returns labeled blocks: material claims with citation IDs, and outside knowledge clearly tagged. This is where the intelligence lives."

*Words: 55. Tone: elevated, climactic. Pause before 'This is where the intelligence lives.'*

---

## Scene 6 — Safety & Grounding (1:38–1:58, 600 frames)

"The server does not trust that response. Every citation is verified against the retrieved set. Any material block without a citation is relabeled. If the retrieval confidence falls below the calibrated threshold, the entire answer is refused. Grounding is enforced in code, not requested in a prompt."

*Words: 49. Tone: firm, principled. Final sentence is the key message — pause before it.*

---

## Scene 7 — Response Journey (1:58–2:15, 600 frames)

"The validated answer travels back to the browser. The student sees the response rendered block by block. A citation chip references a PDF page, a slide, a video timestamp. Click it — and the source opens at the exact location. The loop is complete."

*Words: 45. Tone: satisfying resolution. 'The loop is complete' — final, definitive.*

---

## Scene 8 — Full Architecture (2:15–2:30, 360 frames)

"Browser to API route to domain core to Gemini and back. PostgreSQL as the knowledge store. BKT as the learner model. A contract that validates at every boundary. OmniTutor: a complete learning system, grounded in your material."

*Words: 39. Tone: summative, confident. Pause after each clause. Final word: 'material.' — let it land.*

---

## Recording Notes

- Microphone: condenser recommended; USB interface acceptable
- Room: treated or small room (not large reverberant spaces)
- Pace: 110–120 wpm. Do not rush technical terms.
- Emphasis words: 'one route', 'not in a vector database', 'in code not in a prompt', 'The loop is complete'
- Delivery: documentary, not salesy. Measured certainty, not excitement.
- Export: 48kHz WAV, -23 LUFS integrated loudness, -1 dBFS true peak
- Place recorded files in `C:\Users\styli\OneDrive\Documents\GitHub\Omnitutor\video\public\narration\`

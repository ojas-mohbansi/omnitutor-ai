# OmniTutor Film — Timecoded Storyboard

**Format:** 1920×1080, 30fps  
**Total:** 4395 frames effective (4500 raw − 105 transition overlap)  
**Transitions:** 15-frame linear fade between all 8 scenes

---

## Scene 1 — Opening (Frames 0–360, 0:00–0:12)

**Visual:** Dark navy background. Subtle cyan grid fades in. "OmniTutor" headline animates in (scale + opacity). Cyan accent line draws under title. Subtitle and tech tagline fade in.

**Composition ID:** Scene1Opening  
**Caption:** Full Scene 1 narration  
**Key visual beat:** Grid + Title at frame 36 (1.2s). Accent line completes at frame 60. Tech tagline at frame 84.

**Transition out:** 15-frame fade to Scene 2

---

## Scene 2 — The Interface (Frames 345–885, 0:11.5–0:29.5)

**Visual:** Chat UI panel slides in from left (dark glass card). User message bubble appears. System "Retrieving..." bubble appears. Right panel shows POST /api/chat label + route file path annotation.

**Composition ID:** Scene2Interface  
**Caption:** "A student types a question..."

**Transition out:** 15-frame fade to Scene 3

---

## Scene 3 — API Boundary (Frames 870–1470, 0:29–0:49)

**Visual:** Three boxes animate in: Browser → Route Handler → @sc/core. Cyan arrow from Browser to Route. Violet arrow from Route to Core. Dashed amber trust boundary line. Code snippet fades in showing route.ts handler.

**Composition ID:** Scene3ApiBoundary  
**Key beat:** Trust boundary line at frame 45 (within scene, ~1.5s)  
**Caption:** "The route handler is deliberately thin..."

**Transition out:** 15-frame fade to Scene 4

---

## Scene 4 — Core Pipeline (Frames 1455–2055, 0:48.5–1:08.5)

**Visual:** Three-phase animated flow. Phase 1 (frames 0–90 within scene): question → Gemini Embed → Float[768] vector. Phase 2 (frames 60–120): vector → PostgreSQL → top-6 chunks. Phase 3 (frames 114–150): mastery load from Postgres. All annotated with real file paths.

**Composition ID:** Scene4CorePipeline  
**Caption:** "Inside @sc/core, the tutor function begins..."

**Transition out:** 15-frame fade to Scene 5

---

## Scene 5 — Intelligence Pipeline (Frames 2040–2880, 1:08–1:36)

**Visual:** Centerpiece scene. Three input sources (chunks, learner profile, conversation history) converge with arrows on llm.ts box (violet, pulsing glow). Single arrow to Gemini API (violet, glowing). Return arrows to three output boxes: coverage, blocks[], learnerEvidence. Code path label fades in at end.

**Composition ID:** Scene5IntelligencePipeline  
**Key beat:** Gemini glow at frame 90 within scene. Structured response boxes at frame 135.

**Transition out:** 15-frame fade to Scene 6

---

## Scene 6 — Safety & Grounding (Frames 2865–3465, 1:33.5–1:55.5)

**Visual:** Three guard steps slide in from left sequentially. Each has step number, title, detail text, and a verdict badge. Colors: amber for guards, emerald for VERIFIED, amber for RELABELED, cyan for REFUSED. Timing: ~54 frames between each guard.

**Composition ID:** Scene6SafetyGrounding  
**Guards:** Citation Verification → Block Relabeling → REFUSAL_TAU (0.60)  
**Caption:** "The server does not trust that response..."

**Transition out:** 15-frame fade to Scene 7

---

## Scene 7 — Response Journey (Frames 3450–4050, 1:55–2:15)

**Visual:** Three-phase return path. Phase 1: TutorAnswer JSON box glows emerald. Phase 2: Frontend box, two rendered block cards (material vs outside). Phase 3: Citation chip pulses (scale animation), arrow to PDF/Video/Slide source panel.

**Composition ID:** Scene7ResponseJourney  
**Key beat:** Citation chip pulse at frame 135 within scene  
**Caption:** "The validated answer travels back to the browser..."

**Transition out:** 15-frame fade to Scene 8

---

## Scene 8 — Full Architecture (Frames 4035–4395, 2:14.5–2:28.5)

**Visual:** Full diagram with all 7 nodes. Connection arrows animate in sequentially. Color legend fades in. Final OmniTutor identity badge at bottom center. Tech stack line at bottom.

**Composition ID:** Scene8Architecture  
**Nodes:** Browser · POST /api/chat · @sc/core · llm.ts · Gemini API · PostgreSQL · data/uploads  
**Caption:** "Browser to API route to domain core to Gemini and back..."

---

## Transition Summary

| Transition | At Frame | Duration |
|------------|----------|----------|
| Scene 1 → 2 | 345 | 15 frames |
| Scene 2 → 3 | 870 | 15 frames |
| Scene 3 → 4 | 1455 | 15 frames |
| Scene 4 → 5 | 2040 | 15 frames |
| Scene 5 → 6 | 2865 | 15 frames |
| Scene 6 → 7 | 3450 | 15 frames |
| Scene 7 → 8 | 4035 | 15 frames |

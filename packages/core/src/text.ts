// Student-facing text clean-up. Prompts label excerpts "C1", "C2"… so the model can cite them; those
// ids are internal and must never reach a student ("According to C2, …"). Citations travel separately.
// Rules match how the ids appear in real model output (stored questions, feedback, tutor blocks):
// after a preposition, as a sentence's subject, or after "excerpt"/"source". A bare "C2" in other
// positions (e.g. "Vitamin C2") is left alone.

const ID = String.raw`\[?C\d+\]?`;
const IDS = String.raw`${ID}(?:\s*(?:,|;|/|and|&)\s*${ID})*`;
const NOUN = String.raw`(?:(?:the\s+)?(?:excerpts?|sources?)\s+)?`;
const many = (refs: string) => (refs.match(/C\d+/g)?.length ?? 0) > 1;

/** Sentence-initial attribution: "According to C2, …", "As stated in excerpts C1 and C3, …", "Based on the diagram in C9, …". */
const LEAD_ATTR = new RegExp(
  String.raw`(^|[.!?]\s+)(?:according to|as (?:stated|shown|described|noted|explained|mentioned|defined|seen|given|illustrated) in|based on|per|from|in|see|using)\s+(?:[^.!?,:]{0,60}?\s+(?:in|from|of)\s+)?${NOUN}${IDS}\s*[,:]?\s*`,
  "gi",
);
/** Sentence subject: "C10 defines …", "Excerpt C13 shows …", "Source C13 and C14 demonstrate …". */
const SUBJECT = new RegExp(String.raw`(^|[.!?]\s+)${NOUN}(${IDS})(?=\s+[a-z])`, "gi");
/** Subject of a later clause: "…, and C21 notes …", "while C7 warns …". */
const CLAUSE_SUBJECT = new RegExp(String.raw`(\b(?:and|while|whereas|but|so|since)\s+|,\s+)${NOUN}(${IDS})(?=\s+[a-z])`, "gi");
/** After a preposition mid-sentence: "described in C3 and C4", "from C12:", "(as seen in C13/C14)". */
const AFTER_PREP = new RegExp(String.raw`\b(in|from|by|of|to|see|per)\s+${NOUN}(${IDS})\b`, "gi");
/** Parenthesised: "(C2)", "[C1, C5]", "(see C4)", "(excerpt C2)". */
const PAREN = new RegExp(String.raw`\s*[([]\s*(?:see\s+)?${NOUN}C\d+(?:\s*(?:,|;|/|and|&)\s*C\d+)*\s*[)\]]`, "gi");
/** Anything left that is explicitly named: "excerpt C2", "source C10". */
const NAMED = new RegExp(String.raw`\b(?:the\s+)?(?:excerpts?|sources?)\s+(${IDS})\b`, "gi");

/** Pure: removes internal excerpt ids from text shown to students; leaves everything else untouched. */
export function stripExcerptRefs(text: string): string {
  if (!/C\d/.test(text)) return text;
  let out = text
    .replace(PAREN, "")
    // Dropped at a sentence start; the next word becomes the sentence start (\u0000 = capitalise it).
    .replace(LEAD_ATTR, (_m, start: string) => `${start}\u0000`)
    .replace(SUBJECT, (_m, start: string, refs: string) => `${start}${many(refs) ? "The sources" : "The source"}`)
    .replace(CLAUSE_SUBJECT, (_m, start: string, refs: string) => `${start}${many(refs) ? "the sources" : "the source"}`)
    .replace(AFTER_PREP, (_m, prep: string, refs: string) => `${prep} ${many(refs) ? "the sources" : "the source"}`)
    .replace(NAMED, (_m, refs: string) => (many(refs) ? "the sources" : "the source"));
  out = out.replace(/\u0000\s*(\S)/g, (_m, c: string) => c.toUpperCase()).replace(/\u0000/g, "");
  return out.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
}

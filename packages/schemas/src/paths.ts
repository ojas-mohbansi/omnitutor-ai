// URL builders for every route. Use these instead of hand-built strings:
// they encode ids and query values, and a test checks each one against the registry.
const seg = encodeURIComponent;
const qs = (query: Record<string, string>) => new URLSearchParams(query).toString();

export const paths = {
  health: (opts: { gemini?: boolean } = {}) => (opts.gemini ? `/api/health?${qs({ gemini: "1" })}` : "/api/health"),
  learners: () => "/api/learners",
  signup: () => "/api/auth/signup",
  login: () => "/api/auth/login",
  logout: () => "/api/auth/logout",
  session: () => "/api/auth/session",
  profile: () => "/api/profile",
  notebooks: () => "/api/notebooks",
  flashcards: (topicId?: string) => (topicId ? `/api/flashcards?${qs({ topicId })}` : "/api/flashcards"),
  generateFlashcards: () => "/api/flashcards/generate",
  reviewFlashcard: (id: string) => `/api/flashcards/${seg(id)}/review`,
  activeNotebook: () => "/api/notebooks/active",
  notebook: (id: string) => `/api/notebooks/${seg(id)}`,
  sources: () => "/api/sources",
  uploadSource: (filename: string) => `/api/sources?${qs({ filename })}`,
  source: (id: string) => `/api/sources/${seg(id)}`,
  ingestSource: (id: string) => `/api/sources/${seg(id)}/ingest`,
  file: (sourceId: string) => `/api/files/${seg(sourceId)}`,
  search: () => "/api/search",
  build: () => "/api/build",
  topics: (courseId?: string) => (courseId ? `/api/topics?${qs({ courseId })}` : "/api/topics"),
  chat: () => "/api/chat",
  chatHistory: (learnerId: string) => `/api/chat?${qs({ learnerId })}`,
  evalAnswer: () => "/api/eval/answer",
  evalReport: () => "/api/eval/report",
  quizzes: () => "/api/quiz",
  quiz: (id: string) => `/api/quiz/${seg(id)}`,
  submitQuiz: (id: string) => `/api/quiz/${seg(id)}/submit`,
  report: (id: string) => `/api/quiz/${seg(id)}/report`,
  mastery: (learnerId: string) => `/api/mastery?${qs({ learnerId })}`,
} as const;

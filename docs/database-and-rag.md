# PostgreSQL Data Model and RAG Store

## Database strategy

PostgreSQL is the single persistence foundation for product state and retrieval. Use:
- relational tables through Prisma
- PostgreSQL full-text search (`tsvector`, GIN index)
- `pgvector` embeddings and vector indexes
- SQL joins/filters for course authorization and provenance
- object storage only for large original/derived binary files

Do not add Qdrant, Pinecone, Weaviate, or another separate vector database to the baseline design.

## Extensions and migrations

Enable `vector` (pgvector) in a database migration. Confirm the chosen PostgreSQL image/package includes the extension. Prisma may need raw SQL migrations for extension setup and vector-specific index definitions; check compatibility for the exact Prisma and pgvector versions pinned by the project.

## Core entities

- `User`
- `Course`
- `CourseMembership`
- `Asset`
- `IngestionJob`
- `SourceUnit`
- `RetrievalChunk`
- `Topic`
- `TopicPrerequisite`
- `SourceTopic`
- `Conversation`
- `Message`
- `MessageCitation`
- `Assessment`
- `Question`
- `QuestionSource`
- `QuestionTopic`
- `Attempt`
- `MasteryEvent`
- `MasterySnapshot`
- `AudioSession`
- `TranscriptSegment`

## Prisma schema starter

The following is a conceptual starting point. A Prisma `Unsupported("vector(n)")` field may be needed depending on Prisma version; vector writes/search often use parameterized raw SQL. Confirm exact support before adopting the snippet as a migration.

```prisma
enum AssetType {
  PDF
  SLIDE_DECK
  VIDEO
  AUDIO
}

enum IngestionStatus {
  QUEUED
  PROCESSING
  PARTIAL
  READY
  FAILED
}

enum SourceModality {
  TEXT
  IMAGE
  AUDIO
  VIDEO_FRAME
  TABLE
}

enum Answerability {
  SUPPORTED
  PARTIALLY_SUPPORTED
  INSUFFICIENT_EVIDENCE
  OUT_OF_SCOPE
  PROCESSING_ERROR
}

enum QuestionType {
  MCQ
  SHORT_ANSWER
  NUMERICAL
}

model User {
  id            String             @id @default(cuid())
  email         String             @unique
  displayName   String?
  createdAt     DateTime           @default(now())
  memberships   CourseMembership[]
  conversations Conversation[]
  attempts      Attempt[]
  masteryEvents MasteryEvent[]
}

model Course {
  id          String             @id @default(cuid())
  title       String
  description String?
  createdAt   DateTime           @default(now())
  assets      Asset[]
  memberships CourseMembership[]
  topics      Topic[]
}

model CourseMembership {
  userId    String
  courseId  String
  role      String   @default("LEARNER")
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  course    Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  @@id([userId, courseId])
}

model Asset {
  id              String          @id @default(cuid())
  courseId        String
  type            AssetType
  filename        String
  mimeType        String
  objectKey       String
  sha256          String
  sizeBytes       BigInt
  status          IngestionStatus @default(QUEUED)
  pipelineVersion String
  warnings        Json?
  createdAt       DateTime        @default(now())
  course          Course          @relation(fields: [courseId], references: [id], onDelete: Cascade)
  sourceUnits     SourceUnit[]
  @@unique([courseId, sha256])
  @@index([courseId, status])
}

model SourceUnit {
  id             String         @id @default(cuid())
  assetId        String
  modality       SourceModality
  textContent    String?
  pageNumber     Int?
  slideNumber    Int?
  startMs        BigInt?
  endMs          BigInt?
  boundingBox    Json?
  objectKey      String?
  extractionModel String?
  qualityWarnings Json?
  createdAt      DateTime       @default(now())
  asset          Asset          @relation(fields: [assetId], references: [id], onDelete: Cascade)
  chunks         RetrievalChunk[]
  topicLinks     SourceTopic[]
  citations      MessageCitation[]
  questionLinks  QuestionSource[]
  @@index([assetId, pageNumber, slideNumber])
  @@index([assetId, startMs])
}

model RetrievalChunk {
  id                String   @id @default(cuid())
  courseId          String
  sourceUnitId      String
  content           String
  searchText        String
  embeddingModel    String
  embeddingVersion  String
  // Add vector(n) with a compatible Prisma/SQL strategy.
  createdAt         DateTime @default(now())
  sourceUnit        SourceUnit @relation(fields: [sourceUnitId], references: [id], onDelete: Cascade)
  @@index([courseId])
}

model Topic {
  id          String       @id @default(cuid())
  courseId    String
  name        String
  description String?
  course      Course       @relation(fields: [courseId], references: [id], onDelete: Cascade)
  sourceLinks SourceTopic[]
  @@unique([courseId, name])
}

model SourceTopic {
  sourceUnitId String
  topicId      String
  confidence   Float?
  sourceUnit   SourceUnit @relation(fields: [sourceUnitId], references: [id], onDelete: Cascade)
  topic        Topic      @relation(fields: [topicId], references: [id], onDelete: Cascade)
  @@id([sourceUnitId, topicId])
}

model Conversation {
  id        String    @id @default(cuid())
  userId    String
  courseId  String
  title     String?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  Message[]
  @@index([userId, createdAt])
}

model Message {
  id             String          @id @default(cuid())
  conversationId String
  role           String
  content        String
  answerability  Answerability?
  createdAt      DateTime        @default(now())
  conversation   Conversation    @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  citations      MessageCitation[]
}

model MessageCitation {
  messageId    String
  sourceUnitId String
  quote        String?
  message      Message    @relation(fields: [messageId], references: [id], onDelete: Cascade)
  sourceUnit   SourceUnit @relation(fields: [sourceUnitId], references: [id], onDelete: Cascade)
  @@id([messageId, sourceUnitId])
}

model Assessment {
  id        String     @id @default(cuid())
  courseId  String
  title     String
  config    Json
  createdAt DateTime   @default(now())
  questions Question[]
}

model Question {
  id           String       @id @default(cuid())
  assessmentId String
  type         QuestionType
  prompt       String
  options      Json?
  answerKey    Json
  explanation  String
  fingerprint  String
  verification Json
  assessment   Assessment  @relation(fields: [assessmentId], references: [id], onDelete: Cascade)
  sources      QuestionSource[]
  attempts     Attempt[]
  @@index([fingerprint])
}

model QuestionSource {
  questionId   String
  sourceUnitId String
  question     Question   @relation(fields: [questionId], references: [id], onDelete: Cascade)
  sourceUnit   SourceUnit @relation(fields: [sourceUnitId], references: [id], onDelete: Cascade)
  @@id([questionId, sourceUnitId])
}

model Attempt {
  id          String   @id @default(cuid())
  userId      String
  questionId  String
  response    Json
  isCorrect   Boolean?
  score       Float?
  feedback    String?
  submittedAt DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  question    Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  @@index([userId, submittedAt])
}

model MasteryEvent {
  id           String   @id @default(cuid())
  userId       String
  topicId      String
  eventType    String
  observation  Json
  modelVersion String
  createdAt    DateTime @default(now())
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, topicId, createdAt])
}
```

## Retrieval SQL examples

### Vector search

```sql
SELECT c.id, c.source_unit_id, c.content,
       1 - (c.embedding <=> $1::vector) AS similarity
FROM retrieval_chunks c
WHERE c.course_id = ANY($2)
ORDER BY c.embedding <=> $1::vector
LIMIT $3;
```

### Full-text search

```sql
SELECT c.id, c.source_unit_id, c.content,
       ts_rank(c.search_vector, websearch_to_tsquery('english', $1)) AS rank
FROM retrieval_chunks c
WHERE c.course_id = ANY($2)
  AND c.search_vector @@ websearch_to_tsquery('english', $1)
ORDER BY rank DESC
LIMIT $3;
```

The SQL assumes `embedding` and `search_vector` columns/indexes are added by SQL migrations. Use parameterized SQL and enforce course access before retrieval.

## Lean indexing strategy

1. Start with exact vector search plus GIN full-text index.
2. Measure latency and recall on the real evaluation set.
3. Add a pgvector approximate index only if required.
4. Tune chunk size, candidate count, and index parameters using measured trade-offs.
5. Keep embedding model/version columns so re-indexing is reproducible.
6. Avoid duplicate storage of large original files in PostgreSQL; use local or self-hosted object storage for binaries.

## Important caveats

- `pgvector` is an open-source PostgreSQL extension; verify the selected PostgreSQL distribution includes it.
- Prisma support for vector types depends on the version and may require `Unsupported` fields or parameterized raw SQL.
- Embedding dimensions must match the selected model exactly.
- PostgreSQL full-text search is lexical retrieval, not semantic retrieval; use both lexical and vector search for RAG.
- A database filter is not a substitute for application authorization.

# Development and Deployment

## Free/FOSS-first baseline

The app should not require paid APIs. Use local/self-hosted services and open-source software where feasible. “Free” does not automatically mean open source; check the license of each model, model weights, dependency, and dataset.

Suggested baseline:
- Node.js, TypeScript, React, Next.js, Turborepo
- PostgreSQL + pgvector
- Prisma ORM and Zod
- Docker Compose for local services
- Local filesystem storage for development; self-hosted S3-compatible storage if needed
- Locally runnable embedding, LLM, OCR/vision, ASR, and TTS models selected after license/hardware review
- PostgreSQL-backed jobs initially, or a free/open-source queue if operationally justified

## Prerequisites

Install Node.js LTS, npm, Git, and Docker Desktop/Engine. Pin exact tested versions before release. For Windows, Docker Desktop with WSL2 is a practical development option; Linux deployment is also supported.

## Bootstrap

```bash
git clone <repository-url>
cd omnitutor-ai
npm install
cp .env.example .env
```

Create the workspace scripts as apps/packages are added. The commands below describe the intended workflow.

## Environment template

```dotenv
NODE_ENV=development
APP_URL=http://localhost:3000
DATABASE_URL=postgresql://omnitutor:omnitutor_dev_password@localhost:5432/omnitutor?schema=public
SESSION_SECRET=replace-with-long-random-secret
OBJECT_STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=./.data/uploads
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=
LLM_PROVIDER=local
LLM_MODEL=
ASR_PROVIDER=local
ASR_MODEL=
TTS_PROVIDER=local
TTS_MODEL=
MAX_UPLOAD_MB=500
LOG_LEVEL=info
```

The exact model runtimes and environment variables depend on the selected FOSS models. Validate configuration at startup. Never commit real secrets.

## PostgreSQL + pgvector Compose

Example `infra/docker-compose.yml`:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: omnitutor
      POSTGRES_USER: omnitutor
      POSTGRES_PASSWORD: omnitutor_dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U omnitutor -d omnitutor"]
      interval: 5s
      timeout: 3s
      retries: 20
volumes:
  postgres_data:
```

Use only a local development password. Do not expose the database publicly in production. The image is an example; pin a specific tested image digest/version for reproducible builds.

## Prisma workflow

```bash
npm run db:generate
npm run db:migrate
```

Add SQL migrations to enable `vector` and create vector/full-text indexes. The exact schema and raw SQL integration depend on the pinned Prisma version.

## Run locally

```bash
docker compose -f infra/docker-compose.yml up -d postgres
npm run dev
```

Expected web URL: `http://localhost:3000`. Run the worker as its own Turborepo task.

## Quality gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Add tests for:
- authorization filters in every retrieval query
- citation/source-location correctness
- off-material refusal behavior
- answer-key confidentiality
- idempotent ingestion and job retries
- pgvector and full-text retrieval quality
- mastery-event consistency
- audio transcript and response lifecycle

## Deployment checklist

- TLS, secure sessions, and secret management
- PostgreSQL backup and restore verification
- Private object storage and retention policy
- Durable jobs, retries, and failure queue
- Upload type/size/duration validation
- Resource limits for OCR, media, and local models
- Rate limiting and concurrency limits
- Monitoring for retrieval quality, latency, and ingestion errors
- Versioned evaluation run on release candidates
- License review for all models and datasets

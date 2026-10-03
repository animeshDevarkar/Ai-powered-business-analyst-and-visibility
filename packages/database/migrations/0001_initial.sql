-- Design baseline for the upcoming Postgres adapter; not automatically applied.
-- Tenant authorization, credentials, and billing are separate implementation work.
BEGIN;

CREATE TABLE projects (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  website text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memory_versions (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE TABLE prompts (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  question text NOT NULL,
  intent text NOT NULL CHECK (intent IN ('discovery', 'comparison', 'purchase', 'support')),
  engine text NOT NULL CHECK (engine IN ('chatgpt', 'perplexity', 'google_ai_mode', 'google_ai_overview', 'copilot', 'claude')),
  locale text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, id)
);

CREATE TABLE evidence (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('crawl', 'answer', 'source')),
  artifact_key text NOT NULL,
  captured_at timestamptz NOT NULL,
  UNIQUE (project_id, id)
);

CREATE TABLE issues (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  confidence double precision NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  proposed_fix text NOT NULL,
  validation_method text NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'in_review', 'resolved')),
  UNIQUE (project_id, id)
);

CREATE TABLE issue_evidence (
  project_id uuid NOT NULL,
  issue_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  PRIMARY KEY (project_id, issue_id, evidence_id),
  FOREIGN KEY (project_id, issue_id) REFERENCES issues(project_id, id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, evidence_id) REFERENCES evidence(project_id, id) ON DELETE CASCADE
);

CREATE TABLE observations (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prompt_id uuid NOT NULL,
  observed_at timestamptz NOT NULL,
  provider text NOT NULL,
  collection_method text NOT NULL CHECK (collection_method IN ('dfs_llm_scraper', 'dfs_ai_mode', 'llm_api')),
  model text,
  location text,
  language text,
  device text,
  raw_answer_artifact_key text NOT NULL,
  mentions jsonb NOT NULL DEFAULT '[]',
  citations jsonb NOT NULL DEFAULT '[]',
  parser_confidence double precision NOT NULL CHECK (parser_confidence BETWEEN 0 AND 1),
  FOREIGN KEY (project_id, prompt_id) REFERENCES prompts(project_id, id)
);

CREATE TABLE proposals (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('draft', 'in_review', 'approved', 'published', 'rejected')),
  rollback text NOT NULL,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('approved', 'published') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE job_receipts (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('audit', 'prompt_run', 'sync', 'proposal')),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cost_usd numeric(12,6) CHECK (cost_usd >= 0)
);

CREATE TABLE activity (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prompts_project_idx ON prompts(project_id);
CREATE INDEX issues_project_status_idx ON issues(project_id, status);
CREATE INDEX observations_project_time_idx ON observations(project_id, observed_at DESC);
CREATE INDEX receipts_project_time_idx ON job_receipts(project_id, created_at DESC);
CREATE INDEX activity_project_time_idx ON activity(project_id, created_at DESC);

COMMIT;

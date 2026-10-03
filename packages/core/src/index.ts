import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const httpUrl = z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Use an HTTP or HTTPS URL");

// A website is identified by its hostname, across schemes, ports, and paths.
// Keep distinct subdomains separate, while treating www as the root website.
export function websiteKey(website: string): string {
  return new URL(website).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

export const createProjectSchema = z.object({
  name: text(100),
  website: httpUrl.transform((value) => new URL(value).origin),
  description: z.string().trim().max(1000).default(""),
});

export const memoryInputSchema = z.object({
  positioning: z.string().trim().max(3000),
  audience: z.string().trim().max(3000),
  products: z.array(text(300)).max(50),
  competitors: z.array(text(100)).max(20),
  disallowedClaims: z.array(text(500)).max(50),
  claims: z.array(z.object({
    statement: text(1000),
    sourceUrl: httpUrl,
    owner: text(100),
    approvedAt: z.iso.datetime(),
  })).max(100),
});

export const createPromptSchema = z.object({
  question: text(1000),
  intent: z.enum(["discovery", "comparison", "purchase", "support"]),
  engine: z.enum(["chatgpt", "perplexity", "google_ai_mode", "google_ai_overview", "copilot", "claude"]),
  locale: z.string().regex(/^[a-z]{2,3}-[A-Z]{2}$/, "Use a locale such as en-US"),
  priority: z.enum(["high", "medium", "low"]),
});

export type ProjectInput = z.infer<typeof createProjectSchema>;
export type MemoryInput = z.infer<typeof memoryInputSchema>;
export type PromptInput = z.infer<typeof createPromptSchema>;
export type Project = ProjectInput & { id: string; createdAt: string; updatedAt: string };
export type MemoryVersion = MemoryInput & { id: string; projectId: string; version: number; createdAt: string };
export type Prompt = PromptInput & { id: string; projectId: string; createdAt: string };
export type Evidence = { id: string; projectId: string; url: string; capturedAt: string; artifactKey: string; kind: "crawl" | "answer" | "source" };
export type Issue = { id: string; projectId: string; url: string; title: string; severity: "critical" | "high" | "medium" | "low"; confidence: number; evidenceIds: string[]; proposedFix: string; validationMethod: string; status: "open" | "in_review" | "resolved" };
export type Observation = { id: string; projectId: string; promptId: string; observedAt: string; provider: string; collectionMethod: "dfs_llm_scraper" | "dfs_ai_mode" | "llm_api"; model: string | null; location: string | null; language: string | null; device: string | null; rawAnswerArtifactKey: string; mentions: string[]; citations: string[]; parserConfidence: number };
export type JobReceipt = { id: string; projectId: string; kind: "audit" | "prompt_run" | "sync" | "proposal"; status: "queued" | "running" | "completed" | "failed"; createdAt: string; completedAt: string | null; costUsd: number | null };
export type Activity = { id: string; projectId: string; action: string; createdAt: string };
export type Proposal = { id: string; projectId: string; issueIds: string[]; evidenceIds: string[]; status: "draft" | "in_review" | "approved" | "published" | "rejected"; rollback: string; approvedBy: string | null; approvedAt: string | null };

export type ProjectWorkspace = {
  project: Project;
  memory: MemoryVersion | null;
  memoryVersions: MemoryVersion[];
  prompts: Prompt[];
  issues: Issue[];
  observations: Observation[];
  evidence: Evidence[];
  jobs: JobReceipt[];
  proposals: Proposal[];
  activity: Activity[];
};

export type ApiError = { error: { code: string; message: string; requestId?: string; details?: unknown } };
export type AuthUser = { id: string; name: string; email: string; image?: string | null };
export type AuthConfig = { ready: boolean; google: boolean };
export const engines: Record<PromptInput["engine"], string> = {
  chatgpt: "ChatGPT Search", perplexity: "Perplexity", google_ai_mode: "Google AI Mode",
  google_ai_overview: "Google AI Overviews", copilot: "Copilot", claude: "Claude",
};

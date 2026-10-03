import type { Observation, Prompt } from "@visibility/core";

// Contracts only: no provider calls or credentials are required by the foundation.
export interface AnswerCollector {
  readonly provider: string;
  collect(prompt: Prompt, signal?: AbortSignal): Promise<Omit<Observation, "id" | "projectId" | "promptId">>;
}
export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}
export interface ChangePublisher {
  createDraft(input: { projectId: string; title: string; body: string; evidenceIds: string[] }): Promise<{ externalId: string; reviewUrl: string }>;
  publish(input: { externalId: string; approvalId: string }): Promise<{ publishedUrl: string }>;
}

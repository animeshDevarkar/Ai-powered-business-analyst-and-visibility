import type { JobReceipt } from "@visibility/core";

export interface JobRunner {
  enqueue(input: { projectId: string; kind: JobReceipt["kind"]; idempotencyKey: string; budgetUsd: number }): Promise<JobReceipt>;
  getReceipt(id: string): Promise<JobReceipt | null>;
}

// Durable orchestration and isolated execution will implement these boundaries.
export interface IsolatedExecutor {
  validate(input: { repository: string; commit: string; patch: string; timeoutMs: number }): Promise<{
    passed: boolean;
    artifactKeys: string[];
    previewUrl: string | null;
    costUsd: number;
  }>;
}

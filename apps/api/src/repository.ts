import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Activity, MemoryInput, MemoryVersion, Project, ProjectInput, ProjectWorkspace, Prompt, PromptInput } from "@visibility/core";

type Store = { schemaVersion: 1; projects: Project[]; memory: MemoryVersion[]; prompts: Prompt[]; activity: Activity[] };
const emptyStore = (): Store => ({ schemaVersion: 1, projects: [], memory: [], prompts: [], activity: [] });

export interface WorkspaceRepository {
  listProjects(): Promise<Project[]>;
  getWorkspace(id: string): Promise<ProjectWorkspace | null>;
  createProject(input: ProjectInput, projectId?: string): Promise<Project>;
  saveMemory(projectId: string, input: MemoryInput): Promise<MemoryVersion | null>;
  addPrompt(projectId: string, input: PromptInput): Promise<Prompt | null>;
  deletePrompt(projectId: string, promptId: string): Promise<boolean>;
}

// Single-process development adapter. Serialize writes and replace atomically.
// Production will use Postgres transactions behind the same repository boundary.
export class JsonWorkspaceRepository implements WorkspaceRepository {
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private readonly file: string) {}

  private async read(): Promise<Store> {
    try {
      const data = JSON.parse(await readFile(this.file, "utf8")) as Store;
      if (data.schemaVersion !== 1 || !Array.isArray(data.projects) || !Array.isArray(data.memory) || !Array.isArray(data.prompts) || !Array.isArray(data.activity)) {
        throw new Error("Invalid workspace store; restore a valid backup.");
      }
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
      throw error;
    }
  }

  private mutate<T>(fn: (store: Store) => T): Promise<T> {
    const operation = this.writes.then(async () => {
      const store = await this.read();
      const result = fn(store);
      await mkdir(dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(store, null, 2), "utf8");
      await rename(temporary, this.file);
      return result;
    });
    this.writes = operation.catch(() => undefined);
    return operation;
  }

  private record(store: Store, projectId: string, action: string) {
    store.activity.push({ id: randomUUID(), projectId, action, createdAt: new Date().toISOString() });
    const project = store.projects.find((item) => item.id === projectId);
    if (project) project.updatedAt = new Date().toISOString();
  }

  async listProjects() {
    await this.writes;
    return (await this.read()).projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getWorkspace(id: string): Promise<ProjectWorkspace | null> {
    await this.writes;
    const store = await this.read();
    const project = store.projects.find((item) => item.id === id);
    if (!project) return null;
    const memoryVersions = store.memory.filter((item) => item.projectId === id).sort((a, b) => b.version - a.version);
    return { project, memory: memoryVersions[0] ?? null, memoryVersions,
      prompts: store.prompts.filter((item) => item.projectId === id),
      activity: store.activity.filter((item) => item.projectId === id).reverse(),
      issues: [], observations: [], evidence: [], jobs: [], proposals: [] };
  }

  createProject(input: ProjectInput, projectId = randomUUID()) {
    return this.mutate((store) => {
      const now = new Date().toISOString();
      const project: Project = { ...input, id: projectId, createdAt: now, updatedAt: now };
      store.projects.push(project);
      this.record(store, project.id, "Project created");
      return project;
    });
  }

  saveMemory(projectId: string, input: MemoryInput) {
    return this.mutate((store) => {
      if (!store.projects.some((item) => item.id === projectId)) return null;
      const version = Math.max(0, ...store.memory.filter((item) => item.projectId === projectId).map((item) => item.version)) + 1;
      const memory = { ...input, id: randomUUID(), projectId, version, createdAt: new Date().toISOString() };
      store.memory.push(memory);
      this.record(store, projectId, `Business memory saved as version ${version}`);
      return memory;
    });
  }

  addPrompt(projectId: string, input: PromptInput) {
    return this.mutate((store) => {
      if (!store.projects.some((item) => item.id === projectId)) return null;
      const prompt = { ...input, id: randomUUID(), projectId, createdAt: new Date().toISOString() };
      store.prompts.push(prompt);
      this.record(store, projectId, "Prompt added to portfolio");
      return prompt;
    });
  }

  deletePrompt(projectId: string, promptId: string) {
    return this.mutate((store) => {
      const index = store.prompts.findIndex((item) => item.id === promptId && item.projectId === projectId);
      if (index < 0) return false;
      store.prompts.splice(index, 1);
      this.record(store, projectId, "Prompt removed from portfolio");
      return true;
    });
  }
}

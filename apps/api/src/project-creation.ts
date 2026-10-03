import { randomUUID } from "node:crypto";
import { websiteKey, type Project, type ProjectInput } from "@visibility/core";
import type { WorkspaceRepository } from "./repository.js";
import type { UserProjectStore } from "./user-projects.js";

export type WebsiteClaim = { projectId: string; ownerId: string | null; website: string; createdAt: string };
export interface WebsiteRegistry {
  reserve(key: string, claim: WebsiteClaim): Promise<void>;
  release(key: string, projectId: string): Promise<void>;
}

export class WebsiteAlreadyExistsError extends Error {
  constructor() {
    super("A project for this website already exists. Each website can have only one project.");
    this.name = "WebsiteAlreadyExistsError";
  }
}

export class ProjectCreator {
  constructor(private readonly registry: WebsiteRegistry, private readonly userProjects: UserProjectStore) {}

  async create(repository: WorkspaceRepository, input: ProjectInput, ownerId: string) {
    const key = websiteKey(input.website);
    const projectId = randomUUID();
    await this.registry.reserve(key, { projectId, ownerId, website: input.website, createdAt: new Date().toISOString() });
    let project: Project;
    try {
      project = await repository.createProject(input, projectId);
    } catch (error) {
      // Release only our reservation after a failed local write, never another project's.
      await this.registry.release(key, projectId);
      throw error;
    }
    // Once local storage succeeds, keep the website reserved even if this sync fails.
    // Listing the owner's projects retries the idempotent MongoDB update.
    await this.userProjects.save(ownerId, project);
    return project;
  }

  async syncUserProjects(ownerId: string, projects: Project[]) {
    for (const project of projects) await this.userProjects.save(ownerId, project);
  }
}

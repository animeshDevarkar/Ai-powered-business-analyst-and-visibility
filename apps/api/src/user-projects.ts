import { MongoClient, ObjectId, type Collection } from "mongodb";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { Project } from "@visibility/core";
import { JsonWorkspaceRepository } from "./repository.js";

export type UserProjectSummary = { projectId: string; projectName: string; projectUrl: string; createdAt: string };
export interface UserProjectStore {
  save(ownerId: string, project: Project): Promise<void>;
}
type UserDocument = { _id: ObjectId | string; id?: string; projects?: UserProjectSummary[] };

export class MongoUserProjectStore implements UserProjectStore {
  private client: MongoClient | null = null;
  private initialized: Promise<Collection<UserDocument>> | null = null;
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  private users() {
    if (!this.initialized) {
      this.initialized = (async () => {
        if (!this.env.MONGODB_URI) throw new Error("MongoDB is not configured.");
        this.client = new MongoClient(this.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        await this.client.connect();
        return this.client.db(this.env.MONGODB_DB ?? "analytiq").collection<UserDocument>("user");
      })().catch(async () => {
        await this.client?.close();
        this.client = null;
        this.initialized = null;
        throw new Error("User project storage is unavailable.");
      });
    }
    return this.initialized;
  }

  async save(ownerId: string, project: Project) {
    const users = await this.users();
    const summary: UserProjectSummary = { projectId: project.id, projectName: project.name, projectUrl: project.website, createdAt: project.createdAt };
    const result = await users.updateOne({ $or: [
      { _id: ownerId }, { id: ownerId },
      ...(ObjectId.isValid(ownerId) ? [{ _id: new ObjectId(ownerId) }] : []),
    ] }, [{ $set: { projects: { $concatArrays: [
      { $filter: { input: { $ifNull: ["$projects", []] }, as: "project", cond: { $ne: ["$$project.projectId", { $literal: project.id }] } } },
      { $literal: [summary] },
    ] } } }]);
    if (result.matchedCount !== 1) throw new Error("The project owner could not be found.");
  }

  async syncExistingWorkspaces(directory: string) {
    const users = await this.users();
    let accounts = 0;
    let projects = 0;
    for await (const user of users.find({}, { projection: { _id: 1, id: 1 } })) {
      const ownerId = user.id ?? user._id.toString();
      const key = createHash("sha256").update(ownerId).digest("hex");
      const existing = await new JsonWorkspaceRepository(resolve(directory, `${key}.json`)).listProjects();
      for (const project of existing) { await this.save(ownerId, project); projects++; }
      if (existing.length) {
        const updated = await users.findOne({ _id: user._id }, { projection: { projects: 1 } });
        for (const project of existing) {
          const matches = updated?.projects?.filter((summary) => summary.projectId === project.id) ?? [];
          if (matches.length !== 1 || matches[0].projectName !== project.name || matches[0].projectUrl !== project.website) {
            throw new Error("Stored user project details did not match the workspace.");
          }
        }
      }
      if (existing.length) accounts++;
    }
    return { accounts, projects };
  }

  async close() { await this.client?.close(); }
}

import { MongoClient, MongoServerError, type Collection } from "mongodb";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { websiteKey, type Project } from "@visibility/core";
import { WebsiteAlreadyExistsError, type WebsiteClaim, type WebsiteRegistry } from "./project-creation.js";

type ClaimDocument = WebsiteClaim & { _id: string };
const duplicateKey = (error: unknown) => error instanceof MongoServerError && error.code === 11000;

export async function loadExistingWebsiteClaims(directory: string, legacyFile: string): Promise<WebsiteClaim[]> {
  let files: string[];
  try { files = (await readdir(directory)).filter((file) => file.endsWith(".json")).map((file) => resolve(directory, file)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    files = [];
  }
  files.push(legacyFile);
  const claims: WebsiteClaim[] = [];
  for (const file of files) {
    let content: string;
    try { content = await readFile(file, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    const store = JSON.parse(content) as { schemaVersion: number; projects: Project[] };
    if (store.schemaVersion !== 1 || !Array.isArray(store.projects)) throw new Error("Invalid existing workspace; website registration stopped.");
    for (const project of store.projects) {
      if (typeof project.id !== "string" || typeof project.website !== "string" || typeof project.createdAt !== "string") throw new Error("Invalid existing project; website registration stopped.");
      websiteKey(project.website);
      claims.push({ projectId: project.id, ownerId: null, website: project.website, createdAt: project.createdAt });
    }
  }
  return claims;
}

export class MongoWebsiteRegistry implements WebsiteRegistry {
  private client: MongoClient | null = null;
  private initialized: Promise<Collection<ClaimDocument>> | null = null;

  constructor(private readonly directory: string, private readonly legacyFile: string, private readonly env: NodeJS.ProcessEnv = process.env) {}

  private collection() {
    if (!this.initialized) {
      this.initialized = (async () => {
        if (!this.env.MONGODB_URI) throw new Error("Website registry requires MongoDB configuration.");
        this.client = new MongoClient(this.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        await this.client.connect();
        // MongoDB's unique _id index makes the reservation atomic across all accounts.
        const collection = this.client.db(this.env.MONGODB_DB ?? "analytiq").collection<ClaimDocument>("project_websites");
        for (const claim of await loadExistingWebsiteClaims(this.directory, this.legacyFile)) {
          try {
            await collection.updateOne({ _id: websiteKey(claim.website) }, { $setOnInsert: claim }, { upsert: true });
          } catch (error) { if (!duplicateKey(error)) throw error; }
        }
        return collection;
      })().catch(async () => {
        await this.client?.close();
        this.client = null;
        this.initialized = null;
        throw new Error("Website registry is unavailable. Please try again later.");
      });
    }
    return this.initialized;
  }

  async reserve(key: string, claim: WebsiteClaim) {
    const collection = await this.collection();
    try { await collection.insertOne({ _id: key, ...claim }); }
    catch (error) {
      if (duplicateKey(error)) throw new WebsiteAlreadyExistsError();
      throw new Error("Website registration failed. Please try again later.");
    }
  }

  async release(key: string, projectId: string) {
    await (await this.collection()).deleteOne({ _id: key, projectId });
  }

  async close() { await this.client?.close(); }
}

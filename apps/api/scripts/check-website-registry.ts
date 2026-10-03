import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { MongoWebsiteRegistry } from "../src/website-registry.js";
import { WebsiteAlreadyExistsError } from "../src/project-creation.js";

const registries = [0, 1].map(() => new MongoWebsiteRegistry(resolve(process.env.WORKSPACE_DATA_DIR ?? "../../.data/workspaces"), resolve("../../.data/workspace.json")));
const key = `analytiq-check-${randomUUID()}.invalid`;
const claims = [0, 1].map((index) => ({ projectId: randomUUID(), ownerId: `connection-check-${index}`, website: `https://${key}`, createdAt: new Date().toISOString() }));
try {
  const results = await Promise.allSettled(registries.map((registry, index) => registry.reserve(key, claims[index])));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof WebsiteAlreadyExistsError);
  console.log("MongoDB website uniqueness passed: concurrent reservations from two clients produced one winner and one duplicate rejection.");
} catch {
  console.error("MongoDB website uniqueness verification failed. Connection details were withheld.");
  process.exitCode = 1;
} finally {
  const cleanup = await Promise.allSettled(registries.map((registry, index) => registry.release(key, claims[index].projectId)));
  if (cleanup.some((result) => result.status === "rejected")) { console.error("Temporary registry cleanup could not complete."); process.exitCode = 1; }
  await Promise.allSettled(registries.map((registry) => registry.close()));
}

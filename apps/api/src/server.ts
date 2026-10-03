import "dotenv/config";
import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createApp } from "./app.js";
import { JsonWorkspaceRepository } from "./repository.js";
import { createAuthGateway } from "./auth.js";
import { ProjectCreator } from "./project-creation.js";
import { MongoWebsiteRegistry } from "./website-registry.js";
import { MongoUserProjectStore } from "./user-projects.js";

const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");
const hostname = process.env.HOST ?? "127.0.0.1";
const auth = createAuthGateway();
const websiteRegistry = new MongoWebsiteRegistry(
  resolve(process.env.WORKSPACE_DATA_DIR ?? "../../.data/workspaces"),
  resolve("../../.data/workspace.json"),
);
const userProjects = new MongoUserProjectStore();
const projects = new ProjectCreator(websiteRegistry, userProjects);
const repositories = new Map<string, JsonWorkspaceRepository>();
const repositoryForUser = (userId: string) => {
  let repository = repositories.get(userId);
  if (!repository) {
    const key = createHash("sha256").update(userId).digest("hex");
    repository = new JsonWorkspaceRepository(resolve(process.env.WORKSPACE_DATA_DIR ?? "../../.data/workspaces", `${key}.json`));
    repositories.set(userId, repository);
  }
  return repository;
};
const server = serve({ fetch: createApp(repositoryForUser, auth, projects).fetch, port, hostname }, () => {
  console.log(`Analytiq API: http://${hostname}:${port} (authentication ${auth.config.ready ? "configured" : "awaiting credentials"})`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => { void Promise.allSettled([auth.close(), websiteRegistry.close(), userProjects.close()]).finally(() => process.exit(0)); }));
}

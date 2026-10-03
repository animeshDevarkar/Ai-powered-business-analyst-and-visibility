import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { JsonWorkspaceRepository } from "./repository.js";
import { createAuthGateway, type AuthGateway } from "./auth.js";
import { ProjectCreator, WebsiteAlreadyExistsError, type WebsiteClaim, type WebsiteRegistry } from "./project-creation.js";
import { loadExistingWebsiteClaims } from "./website-registry.js";
import { websiteKey, type Project } from "@visibility/core";

class TestWebsiteRegistry implements WebsiteRegistry {
  readonly claims = new Map<string, WebsiteClaim>();
  async reserve(key: string, claim: WebsiteClaim) {
    if (this.claims.has(key)) throw new WebsiteAlreadyExistsError();
    this.claims.set(key, claim);
  }
  async release(key: string, projectId: string) {
    if (this.claims.get(key)?.projectId === projectId) this.claims.delete(key);
  }
}
const testUserProjects = { async save() {} };
const testProjectCreator = () => new ProjectCreator(new TestWebsiteRegistry(), testUserProjects);

const testAuth: AuthGateway = {
  config: { ready: true, google: false },
  async handler() { return new Response(null, { status: 404 }); },
  async getUser(headers) {
    if (headers.get("x-test-user") === "anonymous") return null;
    const id = headers.get("x-test-user") ?? "owner";
    return { id, name: id, email: `${id}@example.com` };
  },
  async close() {},
};

test("project, versioned memory, scoped prompts, persistence, and exports", async () => {
  const directory = await mkdtemp(join(tmpdir(), "visibility-test-"));
  try {
    const file = join(directory, "store.json");
    const repository = new JsonWorkspaceRepository(file);
    const app = createApp(() => repository, testAuth, testProjectCreator());
    const request = (path: string, method = "GET", data?: unknown) => app.request(path, {
      method, headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data),
    });
    assert.equal((await request("/health")).status, 200);
    assert.equal((await request("/api/projects", "POST", { name: "Acme", website: "ftp://example.com" })).status, 400);
    const response = await request("/api/projects", "POST", { name: "Acme", website: "https://example.com/path" });
    assert.equal(response.status, 201);
    const { data: project } = await response.json();
    assert.equal(project.website, "https://example.com");
    const second = await request("/api/projects", "POST", { name: "Other", website: "https://other.example" });
    const { data: other } = await second.json();
    const memory = { positioning: "Useful software", audience: "Small businesses", products: ["Analytics"], competitors: [], disallowedClaims: ["Invented reviews"], claims: [{ statement: "We make analytics software", sourceUrl: "https://example.com/about", owner: "Owner", approvedAt: new Date().toISOString() }] };
    assert.equal((await request(`/api/projects/${project.id}/memory`, "PUT", { ...memory, claims: [{ ...memory.claims[0], sourceUrl: "javascript:alert(1)" }] })).status, 400);
    await Promise.all([request(`/api/projects/${project.id}/memory`, "PUT", memory), request(`/api/projects/${project.id}/memory`, "PUT", { ...memory, positioning: "Updated positioning" })]);
    const promptResponse = await request(`/api/projects/${project.id}/prompts`, "POST", { question: "What helps small businesses?", engine: "chatgpt", locale: "en-US", intent: "discovery", priority: "medium" });
    assert.equal(promptResponse.status, 201);
    const { data: prompt } = await promptResponse.json();
    assert.equal((await request(`/api/projects/${other.id}/prompts/${prompt.id}`, "DELETE")).status, 404);
    assert.equal((await request("/api/projects/missing/prompts", "POST", { question: "Question?", engine: "chatgpt", locale: "en-US", intent: "discovery", priority: "low" })).status, 404);
    const workspace = (await (await request(`/api/projects/${project.id}`)).json()).data;
    assert.equal(workspace.memory.version, 2);
    assert.equal(workspace.memoryVersions.length, 2);
    assert.equal(workspace.prompts.length, 1);
    assert.equal(workspace.observations.length, 0);
    const restored = await new JsonWorkspaceRepository(file).getWorkspace(project.id);
    assert.equal(restored?.memory?.version, 2);
    assert.equal(restored?.prompts.length, 1);
    const exported = await request(`/api/projects/${project.id}/export`);
    assert.match(exported.headers.get("Content-Disposition") ?? "", /attachment/);
    assert.equal((await exported.json()).data.memoryVersions.length, 2);
    assert.equal((await request(`/api/projects/${project.id}/prompts/${prompt.id}`, "DELETE")).status, 204);
    assert.equal((await request(`/api/projects/${project.id}/prompts/${prompt.id}`, "DELETE")).status, 404);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("invalid JSON, cross-origin writes, and unknown routes return explicit errors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "visibility-test-"));
  try {
    const repository = new JsonWorkspaceRepository(join(directory, "store.json"));
    const app = createApp(() => repository, testAuth, testProjectCreator());
    const malformed = await app.request("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, "INVALID_JSON");
    const crossOrigin = await app.request("/api/projects", { method: "POST", headers: { origin: "https://untrusted.example", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(crossOrigin.status, 403);
    const loopback = await app.request("/api/projects", { method: "POST", headers: { origin: "http://127.0.0.1:3000", "Content-Type": "application/json" }, body: JSON.stringify({ name: "Local", website: "https://example.com" }) });
    assert.equal(loopback.status, 201);
    assert.equal((await app.request("/api/unknown")).status, 404);
    const large = await app.request("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "x".repeat(270000) }) });
    assert.equal(large.status, 413);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("authentication is required and project data is isolated per account", async () => {
  const directory = await mkdtemp(join(tmpdir(), "visibility-auth-test-"));
  try {
    const repositories = new Map<string, JsonWorkspaceRepository>();
    const app = createApp((userId) => {
      if (!repositories.has(userId)) repositories.set(userId, new JsonWorkspaceRepository(join(directory, `${userId}.json`)));
      return repositories.get(userId)!;
    }, testAuth, testProjectCreator());
    const anonymous = await app.request("/api/projects", { headers: { "x-test-user": "anonymous" } });
    assert.equal(anonymous.status, 401);
    assert.equal((await app.request("/api/me", { headers: { "x-test-user": "anonymous" } })).status, 401);
    const created = await app.request("/api/projects", { method: "POST", headers: { "Content-Type": "application/json", "x-test-user": "alice" }, body: JSON.stringify({ name: "Private", website: "https://example.com" }) });
    const project = (await created.json()).data;
    assert.equal(created.status, 201);
    const bobHeaders = { "x-test-user": "bob" };
    assert.deepEqual((await (await app.request("/api/projects", { headers: bobHeaders })).json()).data, []);
    assert.equal((await app.request(`/api/projects/${project.id}`, { headers: bobHeaders })).status, 404);
    assert.equal((await app.request(`/api/projects/${project.id}/export`, { headers: bobHeaders })).status, 404);
    assert.equal((await app.request(`/api/projects/${project.id}/memory`, { method: "PUT", headers: { ...bobHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ positioning: "", audience: "", products: [], competitors: [], disallowedClaims: [], claims: [] }) })).status, 404);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("missing MongoDB credentials never enable authentication or expose project data", async () => {
  const auth = createAuthGateway({});
  const app = createApp(() => { throw new Error("Must not access storage without authentication"); }, auth, testProjectCreator());
  const config = await app.request("/api/auth/config");
  assert.deepEqual((await config.json()).data, { ready: false, google: false });
  assert.equal((await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 503);
  assert.equal((await app.request("/api/projects")).status, 503);
  assert.equal((await app.request("/api/me")).status, 401);
  assert.equal((await auth.getUser(new Headers())), null);
  assert.equal(createAuthGateway({ MONGODB_URI: "mongodb://localhost/test", BETTER_AUTH_SECRET: "short" }).config.ready, false);
  await auth.close();
});

test("the same website cannot be created again by its owner or another account", async () => {
  const directory = await mkdtemp(join(tmpdir(), "visibility-unique-test-"));
  try {
    const repositories = new Map<string, JsonWorkspaceRepository>();
    const app = createApp((userId) => {
      if (!repositories.has(userId)) repositories.set(userId, new JsonWorkspaceRepository(join(directory, `${userId}.json`)));
      return repositories.get(userId)!;
    }, testAuth, testProjectCreator());
    const create = (user: string, website: string) => app.request("/api/projects", { method: "POST", headers: { "Content-Type": "application/json", "x-test-user": user }, body: JSON.stringify({ name: "Website project", website }) });
    assert.equal((await create("alice", "https://example.com")).status, 201);
    for (const user of ["alice", "bob"]) {
      for (const website of ["https://example.com/other?view=1", "http://www.EXAMPLE.com/", "https://example.com.:8443/path"]) {
        const response = await create(user, website);
        assert.equal(response.status, 409);
        const body = await response.json();
        assert.equal(body.error.code, "WEBSITE_ALREADY_EXISTS");
        assert.doesNotMatch(JSON.stringify(body), /alice|bob|@example/);
      }
    }
    assert.equal((await create("bob", "https://blog.example.com")).status, 201);
    const loaded = await loadExistingWebsiteClaims(directory, join(directory, "missing-legacy.json"));
    assert.equal(loaded.length, 2);
    assert.deepEqual(loaded.map((claim) => websiteKey(claim.website)).sort(), ["blog.example.com", "example.com"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("concurrent project requests across accounts and API instances create only one project", async () => {
  const directory = await mkdtemp(join(tmpdir(), "visibility-race-test-"));
  try {
    const registry = new TestWebsiteRegistry();
    const repositories = new Map<string, JsonWorkspaceRepository>();
    const repositoryForUser = (userId: string) => {
      if (!repositories.has(userId)) repositories.set(userId, new JsonWorkspaceRepository(join(directory, `${userId}.json`)));
      return repositories.get(userId)!;
    };
    const apps = [createApp(repositoryForUser, testAuth, new ProjectCreator(registry, testUserProjects)), createApp(repositoryForUser, testAuth, new ProjectCreator(registry, testUserProjects))];
    const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => apps[index % 2].request("/api/projects", { method: "POST", headers: { "Content-Type": "application/json", "x-test-user": `user-${index}` }, body: JSON.stringify({ name: "Concurrent", website: index % 2 ? "https://www.race.example/path" : "http://race.example" }) })));
    assert.equal(responses.filter((response) => response.status === 201).length, 1);
    assert.equal(responses.filter((response) => response.status === 409).length, 7);
    const stored = await Promise.all([...repositories.values()].map((repository) => repository.listProjects()));
    assert.equal(stored.flat().length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("a failed workspace write releases only its own website reservation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "visibility-release-test-"));
  try {
    const registry = new TestWebsiteRegistry();
    const creator = new ProjectCreator(registry, testUserProjects);
    const repository = new JsonWorkspaceRepository(join(directory, "workspace.json"));
    const original = repository.createProject.bind(repository);
    repository.createProject = async () => { throw new Error("Storage unavailable"); };
    const input = { name: "Retry", website: "https://retry.example", description: "" };
    await assert.rejects(creator.create(repository, input, "alice"), /Storage unavailable/);
    assert.equal(registry.claims.size, 0);
    repository.createProject = original;
    const project = await creator.create(repository, input, "alice");
    await registry.release(websiteKey(input.website), "another-project-id");
    assert.equal(registry.claims.get(websiteKey(input.website))?.projectId, project.id);
    await assert.rejects(creator.create(repository, input, "bob"), WebsiteAlreadyExistsError);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("user project sync preserves website uniqueness on failure and can retry saved projects", async () => {
  const directory = await mkdtemp(join(tmpdir(), "visibility-user-projects-test-"));
  try {
    const registry = new TestWebsiteRegistry();
    const saved: { ownerId: string; project: Project }[] = [];
    let unavailable = true;
    const creator = new ProjectCreator(registry, { async save(ownerId, project) {
      if (unavailable) throw new Error("MongoDB unavailable");
      saved.push({ ownerId, project });
    } });
    const repository = new JsonWorkspaceRepository(join(directory, "workspace.json"));
    const input = { name: "Owner's project", website: "https://owner-project.example", description: "" };
    await assert.rejects(creator.create(repository, input, "alice"), /MongoDB unavailable/);
    const projects = await repository.listProjects();
    assert.equal(projects.length, 1);
    assert.equal(registry.claims.get(websiteKey(input.website))?.projectId, projects[0].id);
    await assert.rejects(creator.create(repository, input, "bob"), WebsiteAlreadyExistsError);
    unavailable = false;
    await creator.syncUserProjects("alice", projects);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].ownerId, "alice");
    assert.equal(saved[0].project.name, input.name);
    assert.equal(saved[0].project.website, input.website);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

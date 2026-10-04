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
import { ProviderContentService, type ContentService } from "./content-service.js";
import type { ContentInput, ContentCapabilities } from "@visibility/core";

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

test("content drafts persist, enforce scope and approval, and prevent duplicate publication", async () => {
  const directory = await mkdtemp(join(tmpdir(), "visibility-content-test-"));
  try {
    const repository = new JsonWorkspaceRepository(join(directory, "owner.json"));
    const otherRepository = new JsonWorkspaceRepository(join(directory, "other.json"));
    let calls = 0;
    const config: ContentCapabilities = { generation: true, platforms: { instagram: { ready: true, label: "IG" }, linkedin: { ready: true, label: "LI" }, facebook: { ready: true, label: "FB" } } };
    const service: ContentService = { capabilities: () => config, async generate(_workspace, input) { return { kind: input.kind, platform: input.platform, title: "Generated", body: "Generated body", excerpt: "", imageUrl: "", keywords: input.keywords }; }, validatePublishing(_id, input) { if (input.kind !== "social") throw new Error("Cannot publish blog"); }, async publish() { calls++; return "receipt-123"; } };
    const app = createApp((id) => id === "owner" ? repository : otherRepository, testAuth, testProjectCreator(), service);
    const request = (path: string, method = "GET", body?: unknown, user = "owner") => app.request(path, { method, headers: { "Content-Type": "application/json", "x-test-user": user }, body: body === undefined ? undefined : JSON.stringify(body) });
    const project = await repository.createProject({ name: "Content", website: "https://content.example", description: "" });
    const other = await repository.createProject({ name: "Other", website: "https://other-content.example", description: "" });
    const base = `/api/projects/${project.id}/content`;
    const input: ContentInput = { kind: "social", platform: "linkedin", title: "Launch", body: "Hello audience", excerpt: "", keywords: "analytics", imageUrl: "" };
    assert.equal((await request(base, "POST", { ...input, platform: null })).status, 400);
    assert.equal((await request(base, "POST", { ...input, body: "x".repeat(3001) })).status, 400);
    assert.equal((await request(base, "POST", input, "anonymous")).status, 401);
    assert.equal((await request(base, "POST", input, "other")).status, 404);
    const created = await request(base, "POST", input);
    assert.equal(created.status, 201);
    const draft = (await created.json()).data;
    assert.equal((await request(`${base}/${draft.id}`, "PUT", { ...input, body: "Updated" }, "other")).status, 404);
    assert.equal((await request(`/api/projects/${other.id}/content/${draft.id}`, "DELETE")).status, 404);
    assert.equal((await request(`${base}/config`, "GET", undefined, "other")).status, 404);
    assert.equal((await request(`${base}/generate`, "POST", { kind: "blog", platform: null, topic: "Analytics", tone: "educational", keywords: "" })).status, 200);
    const blogResponse = await request(base, "POST", { ...input, kind: "blog", platform: null, body: "## Introduction\n\nBlog content" });
    assert.equal(blogResponse.status, 201);
    const blog = (await blogResponse.json()).data;
    const restored = await new JsonWorkspaceRepository(join(directory, "owner.json")).getWorkspace(project.id);
    assert.equal(restored?.content.length, 2);
    assert.equal((await (await request(`/api/projects/${project.id}/export`)).json()).data.content.length, 2);
    assert.equal((await request(`${base}/${draft.id}/publish`, "POST", { approved: false, updatedAt: draft.updatedAt })).status, 409);
    assert.equal((await request(`${base}/${draft.id}/publish`, "POST", { approved: true, updatedAt: "stale" })).status, 409);
    assert.equal(calls, 0);
    const responses = await Promise.all([request(`${base}/${draft.id}/publish`, "POST", { approved: true, updatedAt: draft.updatedAt }), request(`${base}/${draft.id}/publish`, "POST", { approved: true, updatedAt: draft.updatedAt })]);
    assert.equal(responses.filter((response) => response.status === 200).length, 1);
    assert.equal(responses.filter((response) => response.status === 409).length, 1);
    assert.equal(calls, 1);
    const published = (await repository.getWorkspace(project.id))!.content.find((item) => item.id === draft.id)!;
    assert.equal(published.status, "published");
    assert.equal(published.externalId, "receipt-123");
    assert.equal((await request(`${base}/${draft.id}`, "PUT", input)).status, 404);
    assert.equal((await request(`${base}/${draft.id}`, "DELETE")).status, 404);
    assert.equal((await request(`${base}/${blog.id}`, "DELETE")).status, 204);
    const uncertain = (await (await request(base, "POST", input)).json()).data;
    service.publish = async () => { calls++; throw new Error("Provider timeout"); };
    assert.equal((await request(`${base}/${uncertain.id}/publish`, "POST", { approved: true, updatedAt: uncertain.updatedAt })).status, 502);
    assert.equal((await repository.getWorkspace(project.id))!.content.find((item) => item.id === uncertain.id)!.status, "publish_unknown");
    assert.equal((await request(`${base}/${uncertain.id}/publish`, "POST", { approved: true, updatedAt: uncertain.updatedAt })).status, 409);
    assert.equal(calls, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("provider adapters keep credentials private, scope accounts, and use correct payloads", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("openai")) return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ title: "Article", body: "## Helpful content", excerpt: "Summary" }) }] }] });
    if (String(url).includes("linkedin")) return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:123" } });
    if (String(url).includes("status_code")) return Response.json({ status_code: "FINISHED" });
    return Response.json({ id: "123" });
  };
  const env = { OPENAI_API_KEY: "private-ai-token", CONTENT_AI_MODEL: "test-model", META_GRAPH_API_VERSION: "v99.0", CONTENT_SOCIAL_ACCOUNTS: JSON.stringify(["instagram", "linkedin", "facebook"].map((platform) => ({ projectId: "project", platform, accessToken: "private-social-token", accountId: platform === "linkedin" ? "urn:li:person:123" : "123", label: platform }))) };
  const provider = new ProviderContentService(env, fakeFetch);
  assert.equal(provider.capabilities("project").platforms.linkedin.ready, true);
  assert.equal(provider.capabilities("other").platforms.linkedin.ready, false);
  assert.doesNotMatch(JSON.stringify(provider.capabilities("project")), /private-/);
  const input: ContentInput = { kind: "social", platform: "linkedin", title: "Launch", body: "Hello", excerpt: "", imageUrl: "", keywords: "" };
  await assert.rejects(provider.publish("other", input), /Connect/);
  await assert.rejects(provider.publish("project", { ...input, platform: "instagram" }), /HTTPS image/);
  assert.equal(calls.length, 0);
  assert.equal(await provider.publish("project", input), "urn:li:share:123");
  assert.equal(JSON.parse(String(calls[0].init?.body)).author, "urn:li:person:123");
  await provider.publish("project", { ...input, platform: "facebook" });
  assert.match(calls[1].url, /\/123\/feed$/);
  assert.equal(new URLSearchParams(String(calls[1].init?.body)).get("message"), "Hello");
  await provider.publish("project", { ...input, platform: "instagram", imageUrl: "https://example.com/image.jpg" });
  assert.match(calls[2].url, /\/media$/);
  assert.match(calls[3].url, /fields=status_code/);
  assert.match(calls[4].url, /\/media_publish$/);
  assert.equal(new URLSearchParams(String(calls[4].init?.body)).get("creation_id"), "123");
  const directory = await mkdtemp(join(tmpdir(), "visibility-generation-test-"));
  try {
    const repository = new JsonWorkspaceRepository(join(directory, "store.json"));
    const project = await repository.createProject({ name: "Generate", website: "https://generation.example", description: "" });
    const workspace = (await repository.getWorkspace(project.id))!;
    const brief = { kind: "blog" as const, platform: null, topic: "Useful analytics", tone: "educational" as const, keywords: "analytics" };
    const generated = await provider.generate(workspace, brief);
    assert.equal(generated.kind, "blog");
    assert.equal(generated.body, "## Helpful content");
    assert.equal((await repository.getWorkspace(project.id))!.content.length, 0);
    await assert.rejects(new ProviderContentService({}, fakeFetch).generate(workspace, brief), /API key/);
    await assert.rejects(new ProviderContentService(env, async () => Response.json({ status: "incomplete", output: [] })).generate(workspace, brief), /incomplete or invalid/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

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

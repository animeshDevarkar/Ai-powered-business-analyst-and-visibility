import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import { logger } from "hono/logger";
import { createProjectSchema, createPromptSchema, memoryInputSchema } from "@visibility/core";
import type { WorkspaceRepository } from "./repository.js";
import type { AuthGateway } from "./auth.js";
import type { AuthUser } from "@visibility/core";
import { ProjectCreator, WebsiteAlreadyExistsError } from "./project-creation.js";

export function createApp(repositoryForUser: (userId: string) => WorkspaceRepository, auth: AuthGateway, projects: ProjectCreator) {
  const app = new Hono<{ Variables: { repository: WorkspaceRepository; user: AuthUser } }>();
  app.use("*", requestId());
  app.use("*", logger());
  app.use("*", bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request exceeds 256 KB" } }, 413) }));
  // Browser clients use the Next.js same-origin proxy. Deny cross-origin writes.
  app.use("/api/*", async (c, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const origin = c.req.header("origin");
      const allowed = process.env.WEB_ORIGIN ? [process.env.WEB_ORIGIN] : [
        "http://localhost:3000", "http://127.0.0.1:3000",
        ...(process.env.BETTER_AUTH_URL ? [new URL(process.env.BETTER_AUTH_URL).origin] : []),
      ];
      if (origin && !allowed.includes(origin)) return c.json({ error: { code: "FORBIDDEN_ORIGIN", message: "Origin is not allowed" } }, 403);
    }
    await next();
  });
  app.get("/health", (c) => c.json({ status: "ok", service: "visibility-api", version: "0.1.0", mode: "local-development" }));
  app.get("/api/auth/config", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({ data: auth.config });
  });
  app.all("/api/auth/*", async (c) => {
    try { return await auth.handler(c.req.raw); }
    catch { return c.json({ code: "AUTH_UNAVAILABLE", message: "Account services are temporarily unavailable. Please try again." }, 503); }
  });
  app.get("/api/me", async (c) => {
    c.header("Cache-Control", "no-store");
    try {
      const user = await auth.getUser(c.req.raw.headers);
      if (!user) return c.json({ error: { code: "UNAUTHORIZED", message: "Please sign in" } }, 401);
      return c.json({ data: user });
    } catch { return c.json({ error: { code: "AUTH_UNAVAILABLE", message: "Account services are temporarily unavailable" } }, 503); }
  });
  app.use("/api/*", async (c, next) => {
    if (c.req.path !== "/api/projects" && !c.req.path.startsWith("/api/projects/")) return next();
    c.header("Cache-Control", "no-store");
    if (!auth.config.ready) return c.json({ error: { code: "AUTH_NOT_CONFIGURED", message: "Account services are not connected yet" } }, 503);
    let user: AuthUser | null;
    try { user = await auth.getUser(c.req.raw.headers); }
    catch { return c.json({ error: { code: "AUTH_UNAVAILABLE", message: "Account services are temporarily unavailable" } }, 503); }
    if (!user) return c.json({ error: { code: "UNAUTHORIZED", message: "Please sign in" } }, 401);
    c.set("user", user);
    c.set("repository", repositoryForUser(user.id));
    await next();
  });
  app.get("/api/projects", async (c) => {
    const data = await c.get("repository").listProjects();
    await projects.syncUserProjects(c.get("user").id, data);
    return c.json({ data });
  });
  app.post("/api/projects", async (c) => {
    const repository = c.get("repository");
    const parsed = createProjectSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "Check the project fields", details: parsed.error.flatten() } }, 400);
    try {
      return c.json({ data: await projects.create(repository, parsed.data, c.get("user").id) }, 201);
    } catch (error) {
      if (error instanceof WebsiteAlreadyExistsError) return c.json({ error: { code: "WEBSITE_ALREADY_EXISTS", message: error.message } }, 409);
      throw error;
    }
  });
  app.get("/api/projects/:id", async (c) => {
    const repository = c.get("repository");
    const workspace = await repository.getWorkspace(c.req.param("id"));
    if (!workspace) return c.json({ error: { code: "NOT_FOUND", message: "Project not found" } }, 404);
    return c.json({ data: workspace });
  });
  app.put("/api/projects/:id/memory", async (c) => {
    const repository = c.get("repository");
    const parsed = memoryInputSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "Check memory fields and claim sources", details: parsed.error.flatten() } }, 400);
    const memory = await repository.saveMemory(c.req.param("id"), parsed.data);
    if (!memory) return c.json({ error: { code: "NOT_FOUND", message: "Project not found" } }, 404);
    return c.json({ data: memory });
  });
  app.post("/api/projects/:id/prompts", async (c) => {
    const repository = c.get("repository");
    const parsed = createPromptSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR", message: "Check the prompt fields", details: parsed.error.flatten() } }, 400);
    const prompt = await repository.addPrompt(c.req.param("id"), parsed.data);
    if (!prompt) return c.json({ error: { code: "NOT_FOUND", message: "Project not found" } }, 404);
    return c.json({ data: prompt }, 201);
  });
  app.delete("/api/projects/:id/prompts/:promptId", async (c) => {
    const repository = c.get("repository");
    if (!await repository.deletePrompt(c.req.param("id"), c.req.param("promptId"))) return c.json({ error: { code: "NOT_FOUND", message: "Prompt not found in this project" } }, 404);
    return c.body(null, 204);
  });
  app.get("/api/projects/:id/export", async (c) => {
    const repository = c.get("repository");
    const workspace = await repository.getWorkspace(c.req.param("id"));
    if (!workspace) return c.json({ error: { code: "NOT_FOUND", message: "Project not found" } }, 404);
    c.header("Content-Disposition", `attachment; filename="visibility-${workspace.project.id}.json"`);
    return c.json({ schemaVersion: 1, exportedAt: new Date().toISOString(), data: workspace });
  });
  app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Endpoint not found" } }, 404));
  app.onError((error, c) => {
    if (error instanceof SyntaxError) return c.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } }, 400);
    const id = c.get("requestId");
    console.error(`[${id}]`, error);
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong", requestId: id } }, 500);
  });
  return app;
}

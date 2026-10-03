import { betterAuth } from "better-auth/minimal";
import type { BetterAuthOptions } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { MongoClient } from "mongodb";
import type { AuthConfig, AuthUser } from "@visibility/core";

export interface AuthGateway {
  config: AuthConfig;
  handler(request: Request): Promise<Response>;
  getUser(headers: Headers): Promise<AuthUser | null>;
  close(): Promise<void>;
}

export function createAuthGateway(env: NodeJS.ProcessEnv = process.env): AuthGateway {
  const uri = env.MONGODB_URI?.trim();
  const secret = env.BETTER_AUTH_SECRET?.trim();
  const ready = Boolean(uri && /^mongodb(?:\+srv)?:\/\//.test(uri) && secret && secret.length >= 32);
  const google = ready && Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
  const baseURL = env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const unavailable = () => new Response(JSON.stringify({ code: "AUTH_NOT_CONFIGURED", message: "Account services are not connected yet." }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  let client: MongoClient | null = null;
  let instance: Promise<ReturnType<typeof betterAuth>> | null = null;

  function getAuth() {
    if (!instance) {
      instance = (async () => {
        client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 });
        await client.connect();
        const db = client.db(env.MONGODB_DB ?? "analytiq");
        await Promise.all([
          db.collection("user").createIndex({ email: 1 }, { unique: true }),
          db.collection("session").createIndex({ token: 1 }, { unique: true }),
          db.collection("session").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          db.collection("verification").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          db.collection("account").createIndex({ providerId: 1, accountId: 1 }, { unique: true }),
        ]);
        return betterAuth<BetterAuthOptions>({
          appName: "Analytiq",
          baseURL,
          secret: secret!,
          // Atlas/replica sets support transactions. Opt out for a standalone dev server.
          database: mongodbAdapter(db, env.MONGODB_TRANSACTIONS === "false" ? {} : { client }),
          trustedOrigins: [new URL(baseURL).origin, ...(env.WEB_ORIGIN ? [env.WEB_ORIGIN] : ["http://localhost:3000", "http://127.0.0.1:3000"])],
          emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
          socialProviders: google ? { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, prompt: "select_account" } } : {},
          account: { encryptOAuthTokens: true, accountLinking: { enabled: false } },
          session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
          advanced: { cookiePrefix: "analytiq" },
          rateLimit: { enabled: true, window: 60, max: 20 },
        });
      })().catch(async () => {
        await client?.close();
        client = null;
        instance = null;
        // Keep connection details out of logs and public errors.
        throw new Error("Account database is unavailable. Check the server configuration.");
      });
    }
    return instance;
  }

  return {
    config: { ready, google },
    async handler(request) { return ready ? (await getAuth()).handler(request) : unavailable(); },
    async getUser(headers) {
      if (!ready) return null;
      const session = await (await getAuth()).api.getSession({ headers });
      if (!session) return null;
      const { id, name, email, image } = session.user;
      return { id, name, email, image };
    },
    async close() { await client?.close(); },
  };
}

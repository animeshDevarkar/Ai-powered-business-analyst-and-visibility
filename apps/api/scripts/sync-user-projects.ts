import "dotenv/config";
import { resolve } from "node:path";
import { MongoUserProjectStore } from "../src/user-projects.js";

const store = new MongoUserProjectStore();
try {
  const result = await store.syncExistingWorkspaces(resolve(process.env.WORKSPACE_DATA_DIR ?? "../../.data/workspaces"));
  console.log(`MongoDB user project sync complete: ${result.projects} projects across ${result.accounts} accounts.`);
} catch {
  console.error("User project sync failed. Connection details were withheld.");
  process.exitCode = 1;
} finally { await store.close(); }

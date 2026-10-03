import { build } from "esbuild";
import { fileURLToPath } from "node:url";

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  // Compile our TypeScript workspace package into the API output.
  alias: { "@visibility/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)) },
});

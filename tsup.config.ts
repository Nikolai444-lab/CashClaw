import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: false,
  splitting: false,
  sourcemap: true,
  dts: false,
  banner: { js: "#!/usr/bin/env node" },
  onSuccess: async () => {
    // Copy kwork-worker.cjs to dist (CommonJS for child_process)
    const { copyFileSync, existsSync } = await import("fs");
    const { resolve } = await import("path");
    const src = resolve("src/kwork/kwork-worker.cjs");
    const dest = resolve("dist/kwork-worker.cjs");
    if (existsSync(src)) {
      copyFileSync(src, dest);
      console.log("✓ Copied kwork-worker.cjs to dist/");
    }
  },
});

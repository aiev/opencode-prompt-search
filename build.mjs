import * as esbuild from "esbuild"
import { rm } from "node:fs/promises"

await rm("dist", { recursive: true, force: true })

await esbuild.build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/tui.js",
  format: "esm",
  platform: "node",
  target: "node20",
  bundle: true,
  sourcemap: false,
  legalComments: "none",
})

console.log("built dist/tui.js")

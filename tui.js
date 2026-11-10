// OpenCode 2.0.x resolves a local plugin directory by looking for `tui` at
// the package root. Newer releases also read package.json `exports`; keeping
// this file makes both paths work.
export { default } from "./dist/tui.js"

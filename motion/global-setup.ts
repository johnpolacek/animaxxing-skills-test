import { execFileSync } from "node:child_process";
import path from "node:path";

export default function globalSetup() {
  execFileSync("node", ["build.mjs"], { cwd: path.resolve(__dirname), stdio: "inherit" });
}

// Extracts each recipe's TypeScript from the installed animaxxing skill,
// type-checks it, and bundles it for the fixtures. Point SKILLS_REPO at
// another checkout to test unreleased recipes.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const skillsRepo = path.resolve(process.env.SKILLS_REPO ?? path.join(here, "../../animaxxing-skills"));
const recipes = path.join(skillsRepo, "skills/animaxxing/references/recipes");
const out = path.join(here, ".build");
const src = path.join(out, "src");
mkdirSync(src, { recursive: true });

/**
 * Splits a recipe into modules. Sections headed with a file name ("## field.ts")
 * become that module; every other TypeScript block joins the recipe's own
 * module. Usage blocks (under "## Wiring" or starting "// Example") are skipped.
 */
function extract(recipe) {
  const markdown = readFileSync(path.join(recipes, `${recipe}.md`), "utf8");
  const modules = new Map();
  let file = recipe;
  let skip = false;
  for (const section of markdown.split(/^(?=## )/m)) {
    const heading = section.match(/^## (.+)$/m)?.[1].trim() ?? "";
    if (/^[\w-]+\.ts$/.test(heading)) file = heading.slice(0, -3);
    skip = heading === "Wiring";
    if (skip) continue;
    for (const [, code] of section.matchAll(/^```ts\n([\s\S]*?)^```$/gm)) {
      if (code.trimStart().startsWith("// Example")) continue;
      modules.set(file, `${modules.get(file) ?? ""}${code}\n`);
    }
  }
  return modules;
}

const RECIPES = [
  "scroll-effects",
  "pointer-effects",
  "svg-effects",
  "counters-and-marquees",
  "split-entrances",
  "route-letters",
  "speak-in",
  "wave",
  "blast-off",
  "particle-field",
  "particle-effects",
];
const files = [];
for (const recipe of RECIPES) {
  for (const [name, code] of extract(recipe)) {
    const file = path.join(src, `${name}.ts`);
    writeFileSync(file, code);
    files.push(file);
  }
}

execFileSync(
  path.join(here, "node_modules/.bin/tsc"),
  ["--noEmit", "--strict", "--noUnusedLocals", "--target", "es2021", "--lib", "es2021,dom,dom.iterable",
    "--moduleResolution", "bundler", "--module", "esnext", "--skipLibCheck", ...files],
  { stdio: "inherit", cwd: here },
);

// One bundle per fixture; each exposes its recipes and GSAP on window.
const ENTRIES = {
  "scroll-effects": `import * as S from "./scroll-effects"; import gsap from "gsap"; import { ScrollTrigger } from "gsap/ScrollTrigger"; Object.assign(window, { S, gsap, ST: ScrollTrigger });`,
  "pointer-effects": `import * as P from "./pointer-effects"; import gsap from "gsap"; Object.assign(window, { P, gsap });`,
  "svg-counters": `import * as V from "./svg-effects"; import * as C from "./counters-and-marquees"; import gsap from "gsap"; Object.assign(window, { V, C, gsap });`,
  text: `import * as SE from "./split-entrances"; import * as RL from "./route-letters"; import * as SI from "./speak-in"; import * as W from "./wave"; import * as B from "./blast-off"; import gsap from "gsap"; Object.assign(window, { SE, RL, SI, W, B, gsap });`,
  particles: `import * as A from "./attach"; import * as FX from "./particle-effects"; import gsap from "gsap"; Object.assign(window, { A, FX, gsap });`,
};
for (const [name, code] of Object.entries(ENTRIES)) {
  const entry = path.join(src, `${name}.entry.ts`);
  writeFileSync(entry, code);
  await build({ entryPoints: [entry], bundle: true, format: "iife", outfile: path.join(out, `${name}.js`), logLevel: "warning", nodePaths: [path.join(here, "node_modules")] });
}
console.log(`Built motion recipes from ${skillsRepo}`);

import { test, expect } from "./fixture";

// Every recipe `ease` option takes a registered CustomEase name.
// "signature" reaches 0.9 at the halfway point, far from any recipe's default ease.
const register = `CustomEase.create("signature", "M0,0 C0.1,0.9 0.3,0.9 1,1")`;

type Page = import("@playwright/test").Page;
/** Ratio of the first child tween at half progress, and the curve's own value there. */
const halfway = (page: Page, build: string) =>
  page.evaluate(
    ([register, build]) => {
      const w = window as any;
      eval(`w.${register}`);
      const animation = eval(build);
      const tweens = animation.getChildren ? animation.getChildren(true, true, false) : [animation];
      const tween = tweens.find((t: any) => t.vars.ease === "signature");
      if (!tween) return null;
      tween.pause().progress(0.5);
      return [tween.ratio, w.gsap.parseEase("signature")(0.5)];
    },
    [register, build] as const,
  );

const expectSignature = (result: number[] | null) => {
  expect(result).not.toBeNull();
  expect(result![0]).toBeCloseTo(result![1]!, 5);
  expect(result![1]).toBeGreaterThan(0.75);
};

test("disclosure and tab indicator take a registered ease", async ({ open }) => {
  const page = await open("component-motion");
  await page.evaluate(() => document.getElementById("acc")!.removeAttribute("hidden"));
  expectSignature(await halfway(page, `w.CM.disclosure(document.getElementById("acc"), { ease: "signature" }).open()`));
  expectSignature(
    await halfway(page, `w.CM.tabIndicator(document.getElementById("ind"), document.getElementById("tabs"), { ease: "signature" }).moveTo(document.getElementById("t2"))`),
  );
});

test("layout and shared-element Flips take a registered ease", async ({ open }) => {
  const page = await open("layout-flip");
  expectSignature(
    await halfway(
      page,
      `(() => { const flip = w.LF.captureLayout(document.querySelectorAll(".card"), { ease: "signature" }); document.getElementById("grid").style.gridTemplateColumns = "1fr"; return flip.play(); })()`,
    ),
  );
  expectSignature(
    await halfway(
      page,
      `(() => { const state = w.LF.captureShared(document.getElementById("thumb")); const hero = document.getElementById("hero"); hero.classList.remove("hidden"); return w.LF.playShared(state, hero, { ease: "signature" }); })()`,
    ),
  );
});

test("the endless loop and grid land with a registered ease", async ({ open }) => {
  const page = await open("endless-drag");
  expectSignature(
    await halfway(page, `w.ED.dragLoop(document.getElementById("lvp"), document.getElementById("ltr"), { ease: "signature" }).toIndex(2)`),
  );
  expectSignature(
    await halfway(page, `w.ED.dragGrid(document.getElementById("gvp"), document.getElementById("grid"), { ease: "signature" }).toTile(2)`),
  );
});

import { test, expect, style } from "./fixture";

// Setup failure and interruption for the text and particle recipes.
// Faults are injected through the shared GSAP instance or DOM APIs the recipes call mid-setup.

test("a split entrance that fails after splitting restores the heading and never completes", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#h", (el) => el.innerHTML);
  const result = await page.evaluate(async () => {
    let fired = 0;
    try {
      // A class token with a space makes classList.add throw after the split exists.
      (window as any).SE.charsRiseIn(document.getElementById("h"), { charMaskClass: "has space", onComplete: () => fired++ });
      return "no throw";
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return `${(error as Error).name}|${fired}`;
    }
  });
  expect(result).toBe("InvalidCharacterError|0");
  expect(await page.$eval("#h", (el) => el.innerHTML)).toBe(original);
  expect(await style(page, "#h")).toBe("");
});

test("a failed setup does not stay GSAP's current context", async ({ open }) => {
  const page = await open("text");
  const result = await page.evaluate(() => {
    const { SE, gsap } = window as any;
    try {
      SE.charsRiseIn(document.getElementById("h"), { charMaskClass: "has space" });
    } catch {}
    const current = !!gsap.context();
    // Were it still current, this tween would be recorded by the failed context.
    const probe = gsap.to({}, { x: 1 });
    const owned = !!probe._ctx;
    probe.kill();
    return { current, owned };
  });
  expect(result).toEqual({ current: false, owned: false });
});

test("killing a parent timeline leaves composed splits for revertText to restore", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#h", (el) => el.innerHTML);
  const split = await page.evaluate(async () => {
    const { SE, gsap } = window as any;
    const heading = document.getElementById("h")!;
    const intro = gsap.timeline().add(SE.charsRiseIn(heading), 0);
    await new Promise((resolve) => setTimeout(resolve, 150));
    intro.kill();
    // A nested runner's own interrupt callback never fires when its parent is killed.
    const stranded = heading.children.length;
    SE.revertText(heading);
    SE.revertText(heading);
    return stranded;
  });
  expect(split).toBeGreaterThan(0);
  expect(await page.$eval("#h", (el) => el.innerHTML)).toBe(original);
});

test("a runner started over a running one stops it, so the old run never completes late", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#h", (el) => el.innerHTML);
  const result = await page.evaluate(async () => {
    const { SE } = window as any;
    const heading = document.getElementById("h")!;
    let stale = 0;
    let fired = 0;
    SE.charsSpringIn(heading, { onComplete: () => stale++ });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const outro = SE.charsFallOut(heading, { onComplete: () => fired++ });
    outro.timeScale(8);
    // The spring's 1.1s run would otherwise finish after the outro and revert its split.
    await new Promise((resolve) => setTimeout(resolve, 1800));
    return { stale, fired };
  });
  expect(result).toEqual({ stale: 0, fired: 1 });
  expect(await page.$eval("#h", (el) => el.innerHTML)).toBe(original);
});

test("reverting the controller's context restores splits it composed after an async wait", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#h", (el) => el.innerHTML);
  await page.evaluate(async () => {
    const { SE, gsap } = window as any;
    const heading = document.getElementById("h")!;
    const ctx = gsap.context(() => {});
    const intro = gsap.timeline();
    await document.fonts.ready;
    ctx.add(() => intro.add(SE.charsScatterIn(heading), 0));
    await new Promise((resolve) => setTimeout(resolve, 150));
    intro.kill();
    ctx.revert();
  });
  expect(await page.$eval("#h", (el) => el.innerHTML)).toBe(original);
});

test("scrambleIn visibly scrambles, then lands on the real words", async ({ open }) => {
  const page = await open("text");
  const warnings: string[] = [];
  page.on("console", (message) => warnings.push(message.text()));
  const text = await page.$eval("#h", (el) => el.textContent);
  const result = await page.evaluate(async () => {
    const heading = document.getElementById("h")!;
    let fired = 0;
    (window as any).SE.scrambleIn(heading, { onComplete: () => fired++ });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const mid = heading.textContent;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { mid, fired };
  });
  expect(result.mid).not.toBe(text);
  expect(result.mid).toMatch(/[01{}/<>()=;]/);
  expect(result.fired).toBe(1);
  expect(await page.$eval("#h", (el) => el.textContent)).toBe(text);
  expect(warnings.filter((w) => /plugin|Invalid property/i.test(w))).toEqual([]);
});

test("killing a split entrance mid-way restores the heading", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#h", (el) => el.innerHTML);
  await page.evaluate(async () => {
    const timeline = (window as any).SE.charsScatterIn(document.getElementById("h"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    timeline.kill();
  });
  expect(await page.$eval("#h", (el) => el.innerHTML)).toBe(original);
});

test("killing a scramble mid-way restores the real words", async ({ open }) => {
  const page = await open("text");
  const text = await page.$eval("#h", (el) => el.textContent);
  await page.evaluate(async () => {
    const timeline = (window as any).SE.scrambleIn(document.getElementById("h"));
    await new Promise((resolve) => setTimeout(resolve, 200));
    timeline.kill();
  });
  expect(await page.$eval("#h", (el) => el.textContent)).toBe(text);
});

test("a route intro that fails mid-setup restores every item and can be rebuilt", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#page", (el) => el.innerHTML);
  const result = await page.evaluate(() => {
    const { RL, gsap } = window as any;
    const random = gsap.utils.random;
    // The letters' scattered start positions are drawn after the split.
    gsap.utils.random = () => {
      throw new Error("boom");
    };
    try {
      RL.buildPageIntro(document.getElementById("page"));
      return "no throw";
    } catch (error) {
      return (error as Error).message;
    } finally {
      gsap.utils.random = random;
    }
  });
  expect(result).toBe("boom");
  // An emptied style attribute is equivalent to none.
  expect((await page.$eval("#page", (el) => el.innerHTML)).replaceAll(' style=""', "")).toBe(original);

  const rebuilt = await page.evaluate(async () => {
    let fired = 0;
    const timeline = (window as any).RL.buildPageIntro(document.getElementById("page"), () => fired++);
    timeline.progress(1);
    return fired;
  });
  expect(rebuilt).toBe(1);
  expect(await page.$eval("#title", (el) => el.children.length)).toBe(0);
});

test("speak-in that fails mid-sentence restores the paragraph", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#sub", (el) => el.innerHTML);
  const result = await page.evaluate(() => {
    const { SI, gsap } = window as any;
    const fromTo = gsap.fromTo;
    let calls = 0;
    gsap.fromTo = (...args: unknown[]) => {
      if (++calls === 4) throw new Error("boom");
      return fromTo.apply(gsap, args);
    };
    try {
      SI.speakIn(document.getElementById("sub"), { emphasis: ["rizz"] });
      return "no throw";
    } catch (error) {
      return (error as Error).message;
    } finally {
      gsap.fromTo = fromTo;
    }
  });
  expect(result).toBe("boom");
  expect(await page.$eval("#sub", (el) => el.innerHTML)).toBe(original);
  expect(await style(page, "#sub")).toBe("");
});

test("a wave that fails while measuring restores the heading", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#h", (el) => el.innerHTML);
  const result = await page.evaluate(() => {
    const heading = document.getElementById("h")!;
    const measure = Element.prototype.getBoundingClientRect;
    // Measuring a split letter fails, so the split already exists.
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this !== heading && heading.contains(this)) throw new Error("boom");
      return measure.call(this);
    };
    try {
      (window as any).W.startWave(heading);
      return "no throw";
    } catch (error) {
      return (error as Error).message;
    } finally {
      Element.prototype.getBoundingClientRect = measure;
    }
  });
  expect(result).toBe("boom");
  expect(await page.$eval("#h", (el) => el.innerHTML)).toBe(original);
});

test("blast-off that fails after splitting restores the hero", async ({ open }) => {
  const page = await open("text");
  const heading = await page.$eval("#hh", (el) => el.innerHTML);
  const result = await page.evaluate(() => {
    const { B } = window as any;
    const heading = document.getElementById("hh")!;
    const measure = Element.prototype.getBoundingClientRect;
    // Measuring a split letter fails, so the split and the timeline already exist.
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this !== heading && heading.contains(this)) throw new Error("boom");
      return measure.call(this);
    };
    try {
      B.blastOff({
        root: document.getElementById("hero"),
        heading: document.getElementById("hh"),
        words: [],
        pressed: document.getElementById("go"),
        others: [document.getElementById("other")],
      });
      return "no throw";
    } catch (error) {
      return (error as Error).message;
    } finally {
      Element.prototype.getBoundingClientRect = measure;
    }
  });
  expect(result).toBe("boom");
  expect(await page.$eval("#hh", (el) => el.innerHTML)).toBe(heading);
  for (const id of ["#hero", "#hh", "#go", "#other"]) expect(await style(page, id), id).toBe("");
});

test("a particle effect whose create throws leaves no field running", async ({ open }) => {
  const page = await open("particles");
  const result = await page.evaluate(async () => {
    const { A, FX } = window as any;
    const canvas = document.getElementById("cv") as HTMLCanvasElement;
    const broken = { ...FX.reactor, create: () => { throw new Error("boom"); } };
    try {
      A.attachParticleEffect(document.getElementById("wrap"), canvas, document.getElementById("btn"), broken);
      return "no throw";
    } catch (error) {
      // A working effect attaches cleanly afterwards.
      const fx = A.attachParticleEffect(document.getElementById("wrap"), canvas, document.getElementById("btn"), FX.reactor);
      fx.destroy();
      return (error as Error).message;
    }
  });
  expect(result).toBe("boom");
});

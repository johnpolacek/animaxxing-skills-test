import { test, expect, style, prop, declared, declarations as styleDeclarations } from "./fixture";

// Recipe: animaxxing/references/recipes/component-motion.md

const rect = (page: import("@playwright/test").Page, selector: string) =>
  page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, width: r.width, height: r.height };
  });

/** Bottom inset percent of the panel's inline clip-path, however the browser serializes it. */
const inset = (page: import("@playwright/test").Page) =>
  page.$eval("#menu", (el) => {
    const parts = (el as HTMLElement).style.clipPath.match(/inset\(([^)]*)\)/)![1].split(/\s+/).map(parseFloat);
    return parts[2] ?? parts[0];
  });

/** Inline declarations, sorted, since GSAP writes a set() in reverse property order. */
const declarations = (page: import("@playwright/test").Page, selector: string) =>
  page.$eval(selector, (el) => (el.getAttribute("style") ?? "").split(";").map((d) => d.trim()).filter(Boolean).sort());

/**
 * GSAP's clock, held and stepped by exact amounts, so mid-animation samples do
 * not depend on how loaded the machine is. Freeze before the trigger.
 */
const freeze = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    (window as any).gsap.globalTimeline.pause();
  });
const advance = (page: import("@playwright/test").Page, seconds: number) =>
  page.evaluate((s) => {
    const clock = (window as any).gsap.globalTimeline;
    clock.time(clock.time() + s);
  }, seconds);
const release = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    (window as any).gsap.globalTimeline.resume();
  });

test("menu overlay wipes in, staggers links, closes, and restores", async ({ open }) => {
  const page = await open("component-motion");
  await page.evaluate(() => ((window as any).m = (window as any).CM.menuOverlay(document.getElementById("menu"), { duration: 0.4, stagger: 0.08 })));
  expect(await page.$eval("#menu", (el) => getComputedStyle(el).visibility)).toBe("hidden");
  expect(await inset(page)).toBe(100);
  // Hidden links are out of the tab order.
  expect(await page.$eval("#l1", (el) => getComputedStyle(el).visibility)).toBe("hidden");

  await freeze(page);
  await page.evaluate(() => {
    (window as any).fired = 0;
    (window as any).m.open().eventCallback("onComplete", () => (window as any).fired++);
  });
  await advance(page, 0.2);
  const mid = await inset(page);
  expect(mid).toBeGreaterThan(0);
  expect(mid).toBeLessThan(100);
  expect(await page.$eval("#menu", (el) => getComputedStyle(el).visibility)).toBe("visible");
  await advance(page, 0.4);
  // The first link is ahead of the last while they stagger in.
  expect(await prop(page, "#l1", "opacity")).toBeGreaterThan(await prop(page, "#l3", "opacity"));
  await release(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).fired)).toBe(1);
  expect(await inset(page)).toBe(0);
  expect(await page.$$eval("#menu a", (links) => links.map((a) => getComputedStyle(a).opacity))).toEqual(["1", "1", "1"]);
  expect(await prop(page, "#l1", "y")).toBe(0);

  await page.evaluate(() => {
    (window as any).m.close().eventCallback("onComplete", () => (window as any).fired++);
  });
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => (window as any).fired)).toBe(2);
  expect(await inset(page)).toBe(100);
  expect(await page.$eval("#menu", (el) => getComputedStyle(el).visibility)).toBe("hidden");
  expect(await page.$eval("#l1", (el) => getComputedStyle(el).visibility)).toBe("hidden");

  await page.evaluate(() => {
    (window as any).m.revert();
    (window as any).m.revert();
  });
  expect(await style(page, "#menu")).toBe("");
  for (const id of ["#l1", "#l2", "#l3"]) expect(await style(page, id), id).toBe("");
});

test("closing the menu mid-open turns back from where the wipe is", async ({ open }) => {
  const page = await open("component-motion");
  const result = await page.evaluate(async () => {
    const m = (window as any).CM.menuOverlay(document.getElementById("menu"), { duration: 0.5 });
    const read = () => {
      const parts = document.getElementById("menu")!.style.clipPath.match(/inset\(([^)]*)\)/)![1].split(/\s+/).map(parseFloat);
      return parts[2] ?? parts[0];
    };
    m.open();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const opening = read();
    let fired = 0;
    m.close().eventCallback("onComplete", () => fired++);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const turning = read();
    await new Promise((resolve) => setTimeout(resolve, 900));
    return { opening, turning, fired, closed: read(), visibility: getComputedStyle(document.getElementById("menu")!).visibility };
  });
  expect(result.opening).toBeGreaterThan(0);
  expect(result.opening).toBeLessThan(100);
  // Heading back toward 100 from the interrupted value, never reset to either end.
  expect(result.turning).toBeGreaterThanOrEqual(result.opening - 1);
  expect(result.turning).toBeLessThan(100);
  expect(result.fired).toBe(1);
  expect(result.closed).toBe(100);
  expect(result.visibility).toBe("hidden");
});

test("menu overlay under reduced motion appears and vanishes whole with callbacks", async ({ open }) => {
  const page = await open("component-motion");
  const result = await page.evaluate(async () => {
    document.documentElement.dataset.motion = "reduced";
    const menu = document.getElementById("menu")!;
    const m = (window as any).CM.menuOverlay(menu);
    let fired = 0;
    // Zero-duration timelines still complete on the next tick; wait for that instead of a fixed time.
    const settle = (tl: any) => new Promise<void>((resolve) => tl.eventCallback("onComplete", () => { fired++; resolve(); }));
    await settle(m.open());
    const read = () => {
      const parts = menu.style.clipPath.match(/inset\(([^)]*)\)/)![1].split(/\s+/).map(parseFloat);
      return parts[2] ?? parts[0];
    };
    const shown = { clip: read(), visibility: getComputedStyle(menu).visibility, link: getComputedStyle(document.getElementById("l3")!).opacity };
    await settle(m.close());
    const hidden = { clip: read(), visibility: getComputedStyle(menu).visibility, link: getComputedStyle(document.getElementById("l3")!).opacity };
    m.revert();
    return { fired, shown, hidden, after: menu.getAttribute("style") ?? "" };
  });
  expect(result).toEqual({
    fired: 2,
    shown: { clip: 0, visibility: "visible", link: "1" },
    hidden: { clip: 100, visibility: "hidden", link: "0" },
    after: "",
  });
});

test("a menu setup that throws rolls back the panel and rethrows", async ({ open }) => {
  const page = await open("component-motion");
  const result = await page.evaluate(() => {
    const menu = document.getElementById("menu")!;
    try {
      // The panel is hidden and clipped before the links are queried; the invalid selector throws there.
      (window as any).CM.menuOverlay(menu, { links: "a[[" });
      return "no throw";
    } catch (error) {
      return `${(error as Error).name}|${menu.getAttribute("style") ?? ""}|${!!(window as any).gsap.context()}`;
    }
  });
  expect(result).toBe("SyntaxError|" + "|false");
});

test("dialog opens with a fading backdrop, exits before closing, and keeps native focus return", async ({ open }) => {
  const page = await open("component-motion");
  await page.evaluate(() => {
    const dialog = document.getElementById("dlg") as HTMLDialogElement;
    (window as any).d = (window as any).CM.dialogMotion(dialog, { duration: 0.4 });
    document.getElementById("open-dialog")!.addEventListener("click", () => (window as any).d.open());
  });
  // Focus the trigger as a real click would, then click and sample in one task, so load cannot let the entrance finish first.
  await page.focus("#open-dialog");
  const early = await page.evaluate(async () => {
    const el = document.getElementById("dlg") as HTMLDialogElement;
    document.getElementById("open-dialog")!.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return {
      open: el.open,
      opacity: Number(getComputedStyle(el).opacity),
      backdrop: Number(getComputedStyle(el, "::backdrop").opacity),
      focus: document.activeElement?.id,
    };
  });
  expect(early.open).toBe(true);
  expect(early.opacity).toBeLessThan(0.9);
  expect(early.backdrop).toBeLessThan(0.9);
  expect(early.focus).toBe("dlg-ok");
  await page.waitForTimeout(600);
  expect(await page.$eval("#dlg", (el) => [getComputedStyle(el).opacity, getComputedStyle(el, "::backdrop").opacity])).toEqual(["1", "1"]);
  expect(await prop(page, "#dlg", "scale")).toBe(1);

  const closed = await page.evaluate(async () => {
    const dialog = document.getElementById("dlg") as HTMLDialogElement;
    let fired = 0;
    (window as any).d.close("ok").eventCallback("onComplete", () => fired++);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const during = { open: dialog.open, opacity: Number(getComputedStyle(dialog).opacity) };
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { during, fired, open: dialog.open, value: dialog.returnValue, focus: document.activeElement?.id, style: dialog.getAttribute("style") ?? "" };
  });
  expect(closed.during.open).toBe(true);
  expect(closed.during.opacity).toBeLessThan(1);
  expect(closed.fired).toBe(1);
  expect(closed.open).toBe(false);
  expect(closed.value).toBe("ok");
  expect(closed.focus).toBe("open-dialog");
  // The close event returns the dialog to its own styles.
  expect(closed.style).toBe("");

  await page.evaluate(() => {
    (window as any).d.revert();
    (window as any).d.revert();
  });
  expect(await style(page, "#dlg")).toBe("");
});

test("Escape runs the dialog's exit instead of the instant close", async ({ open }) => {
  const page = await open("component-motion");
  await page.evaluate(() => {
    (window as any).d = (window as any).CM.dialogMotion(document.getElementById("dlg"), { duration: 0.4 });
    document.getElementById("open-dialog")!.addEventListener("click", () => (window as any).d.open());
  });
  await page.click("#open-dialog");
  await page.waitForTimeout(500);
  await freeze(page);
  await page.keyboard.press("Escape");
  await advance(page, 0.1);
  const during = await page.$eval("#dlg", (el) => ({ open: (el as HTMLDialogElement).open, opacity: Number(getComputedStyle(el).opacity) }));
  expect(during.open).toBe(true);
  expect(during.opacity).toBeLessThan(1);
  await release(page);
  await page.waitForTimeout(500);
  expect(await page.$eval("#dlg", (el) => (el as HTMLDialogElement).open)).toBe(false);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("open-dialog");
  expect(await style(page, "#dlg")).toBe("");
});

test("a drawer slides from its edge, reopening mid-exit continues from there, and reduced motion is instant", async ({ open }) => {
  const page = await open("component-motion");
  const result = await page.evaluate(async () => {
    const { CM, gsap } = window as any;
    const dialog = document.getElementById("drawer") as HTMLDialogElement;
    const d = CM.dialogMotion(dialog, { placement: "right", duration: 0.4 });
    d.open();
    const start = Number(gsap.getProperty(dialog, "xPercent"));
    await new Promise((resolve) => setTimeout(resolve, 600));
    const shown = Number(gsap.getProperty(dialog, "xPercent"));
    d.close();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const leaving = Number(gsap.getProperty(dialog, "xPercent"));
    let fired = 0;
    d.open().eventCallback("onComplete", () => fired++);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const returning = Number(gsap.getProperty(dialog, "xPercent"));
    await new Promise((resolve) => setTimeout(resolve, 600));
    const reopened = { fired, open: dialog.open, x: Number(gsap.getProperty(dialog, "xPercent")) };

    document.documentElement.dataset.motion = "reduced";
    const settle = (tl: any) => new Promise<void>((resolve) => tl.eventCallback("onComplete", () => { fired++; resolve(); }));
    await settle(d.close("done"));
    const closed = { open: dialog.open, value: dialog.returnValue, fired };
    await settle(d.open());
    const instant = { open: dialog.open, opacity: getComputedStyle(dialog).opacity, x: Number(gsap.getProperty(dialog, "xPercent")), fired };
    dialog.close();
    await new Promise((resolve) => setTimeout(resolve, 30));
    d.revert();
    return { start, shown, leaving, returning, reopened, closed, instant, style: dialog.getAttribute("style") ?? "" };
  });
  expect(result.start).toBe(100);
  expect(result.shown).toBe(0);
  expect(result.leaving).toBeGreaterThan(0);
  expect(result.leaving).toBeLessThan(100);
  // Heading back to 0 from the interrupted value.
  expect(result.returning).toBeLessThanOrEqual(result.leaving);
  expect(result.returning).toBeGreaterThan(0);
  expect(result.reopened).toEqual({ fired: 1, open: true, x: 0 });
  expect(result.closed).toEqual({ open: false, value: "done", fired: 2 });
  expect(result.instant).toEqual({ open: true, opacity: "1", x: 0, fired: 3 });
  expect(result.style).toBe("");
});

test("disclosure collapses a hidden panel at build, grows to its content, clears its height, and collapses back", async ({ open }) => {
  const page = await open("component-motion");
  await page.evaluate(() => ((window as any).a = (window as any).CM.disclosure(document.getElementById("acc"), { duration: 0.4 })));
  expect(await declarations(page, "#acc")).toEqual(["height: 0px", "overflow: hidden"]);

  await freeze(page);
  await page.evaluate(() => {
    const panel = document.getElementById("acc")!;
    panel.hidden = false;
    (window as any).fired = 0;
    (window as any).a.open().eventCallback("onComplete", () => (window as any).fired++);
  });
  // Shown but still collapsed until the tween's first frame moves it.
  await advance(page, 0.2);
  const mid = await rect(page, "#acc");
  expect(mid.height).toBeGreaterThan(0);
  expect(mid.height).toBeLessThan(152);
  expect(await page.$eval("#acc", (el) => getComputedStyle(el).overflow)).toBe("hidden");
  await release(page);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).fired)).toBe(1);
  expect((await rect(page, "#acc")).height).toBe(152);
  // Open at rest: no inline height, so content can reflow.
  expect(await style(page, "#acc")).toBe("");

  await page.evaluate(() => {
    (window as any).a.close().eventCallback("onComplete", () => {
      (window as any).fired++;
      document.getElementById("acc")!.hidden = true;
    });
  });
  await page.waitForTimeout(200);
  const closing = await rect(page, "#acc");
  expect(closing.height).toBeGreaterThan(0);
  expect(closing.height).toBeLessThan(152);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).fired)).toBe(2);
  expect(await page.$eval("#acc", (el) => [(el as HTMLElement).hidden, (el as HTMLElement).style.height])).toEqual([true, "0px"]);

  // Reopen starts from 0 again, then revert restores the app's inline styles.
  await page.evaluate(async () => {
    const panel = document.getElementById("acc")!;
    panel.hidden = false;
    (window as any).a.open();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  expect((await rect(page, "#acc")).height).toBeLessThan(152);
  await page.evaluate(() => {
    (window as any).a.revert();
    (window as any).a.revert();
  });
  expect(await style(page, "#acc")).toBe("");
  expect((await rect(page, "#acc")).height).toBe(152);
});

test("closing a disclosure mid-open shrinks from where it is", async ({ open }) => {
  const page = await open("component-motion");
  const result = await page.evaluate(async () => {
    const panel = document.getElementById("acc")!;
    const a = (window as any).CM.disclosure(panel, { duration: 0.5 });
    panel.hidden = false;
    a.open();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const opening = panel.getBoundingClientRect().height;
    a.close();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const turning = panel.getBoundingClientRect().height;
    await new Promise((resolve) => setTimeout(resolve, 700));
    return { opening, turning, closed: panel.getBoundingClientRect().height, style: (panel.getAttribute("style") ?? "").split(";").map((d) => d.trim()).filter(Boolean).sort() };
  });
  expect(result.opening).toBeGreaterThan(20);
  expect(result.opening).toBeLessThan(152);
  expect(result.turning).toBeLessThanOrEqual(result.opening + 1);
  expect(result.turning).toBeGreaterThan(0);
  expect(result.closed).toBe(0);
  expect(result.style).toEqual(["height: 0px", "overflow: hidden"]);
});

test("disclosure animates a <details> panel around its own open state", async ({ open }) => {
  const page = await open("component-motion");
  await page.evaluate(() => {
    const details = document.getElementById("det") as HTMLDetailsElement;
    const panel = document.getElementById("det-panel")!;
    const motion = (window as any).CM.disclosure(panel, { duration: 0.3 });
    document.getElementById("sum")!.addEventListener("click", (event) => {
      event.preventDefault();
      if (details.open) motion.close().eventCallback("onComplete", () => (details.open = false));
      else {
        details.open = true;
        motion.open();
      }
    });
  });
  // Not rendered inside the closed details, so collapsed at build.
  expect(await declarations(page, "#det-panel")).toEqual(["height: 0px", "overflow: hidden"]);
  await freeze(page);
  await page.click("#sum");
  await advance(page, 0.1);
  const growing = await page.$eval("#det", (el) => ({ open: (el as HTMLDetailsElement).open, height: document.getElementById("det-panel")!.getBoundingClientRect().height }));
  expect(growing.open).toBe(true);
  expect(growing.height).toBeGreaterThan(0);
  expect(growing.height).toBeLessThan(152);
  await release(page);
  await page.waitForTimeout(400);
  expect((await rect(page, "#det-panel")).height).toBe(152);
  expect(await style(page, "#det-panel")).toBe("");
  await page.click("#sum");
  await page.waitForTimeout(100);
  expect(await page.$eval("#det", (el) => (el as HTMLDetailsElement).open)).toBe(true);
  await page.waitForTimeout(400);
  expect(await page.$eval("#det", (el) => (el as HTMLDetailsElement).open)).toBe(false);
});

test("disclosure under reduced motion snaps between rest states and completes", async ({ open }) => {
  const page = await open("component-motion");
  const result = await page.evaluate(async () => {
    document.documentElement.dataset.motion = "reduced";
    const panel = document.getElementById("acc")!;
    const a = (window as any).CM.disclosure(panel);
    let fired = 0;
    const settle = (tl: any) => new Promise<void>((resolve) => tl.eventCallback("onComplete", () => { fired++; resolve(); }));
    panel.hidden = false;
    await settle(a.open());
    const opened = { height: panel.getBoundingClientRect().height, style: panel.getAttribute("style") ?? "" };
    await settle(a.close());
    const closed = { height: panel.getBoundingClientRect().height, style: (panel.getAttribute("style") ?? "").split(";").map((d) => d.trim()).filter(Boolean).sort() };
    a.revert();
    return { fired, opened, closed, after: panel.getAttribute("style") ?? "" };
  });
  expect(result).toEqual({
    fired: 2,
    opened: { height: 152, style: "" },
    closed: { height: 0, style: ["height: 0px", "overflow: hidden"] },
    after: "",
  });
});

test("tab indicator sits under the selected tab, slides onto the next, follows resize, and restores", async ({ open }) => {
  const page = await open("component-motion");
  await page.evaluate(() => ((window as any).ti = (window as any).CM.tabIndicator(document.getElementById("ind"), document.getElementById("tabs"), { duration: 0.4 })));
  const t1 = await rect(page, "#t1");
  const placed = await rect(page, "#ind");
  expect(Math.abs(placed.left - t1.left)).toBeLessThan(0.5);
  expect(Math.abs(placed.width - t1.width)).toBeLessThan(0.5);
  expect(await page.$eval("#ind", (el) => (el as HTMLElement).style.transformOrigin)).toBe("0% 50%");

  await freeze(page);
  await page.evaluate(() => {
    (window as any).fired = 0;
    (window as any).ti.moveTo(document.getElementById("t3")).eventCallback("onComplete", () => (window as any).fired++);
  });
  await advance(page, 0.15);
  const t3 = await rect(page, "#t3");
  const sliding = await rect(page, "#ind");
  expect(sliding.left).toBeGreaterThan(t1.left + 5);
  expect(sliding.left).toBeLessThan(t3.left - 5);
  await release(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).fired)).toBe(1);
  const landed = await rect(page, "#ind");
  expect(Math.abs(landed.left - t3.left)).toBeLessThan(0.5);
  expect(Math.abs(landed.width - t3.width)).toBeLessThan(0.5);
  // Only transforms moved it; its own box is unchanged.
  expect(await page.$eval("#ind", (el) => (el as HTMLElement).offsetWidth)).toBe(40);

  // Widening an earlier tab shifts the active one; the observer re-fits without a tween.
  await page.evaluate(() => (document.getElementById("t2")!.style.width = "260px"));
  await page.waitForTimeout(100);
  const shifted = await rect(page, "#t3");
  expect(shifted.left).toBeGreaterThan(t3.left + 90);
  const refit = await rect(page, "#ind");
  expect(Math.abs(refit.left - shifted.left)).toBeLessThan(0.5);
  expect(Math.abs(refit.width - shifted.width)).toBeLessThan(0.5);

  await page.evaluate(() => {
    (window as any).ti.revert();
    (window as any).ti.revert();
  });
  expect(await style(page, "#ind")).toBe("");
});

test("tab indicator lands on RTL tabs and jumps under reduced motion", async ({ open }) => {
  const page = await open("component-motion");
  await page.evaluate(() => ((window as any).ti = (window as any).CM.tabIndicator(document.getElementById("rind"), document.getElementById("rtl"))));
  const r1 = await rect(page, "#r1");
  const placed = await rect(page, "#rind");
  expect(r1.left).toBeGreaterThan(300);
  expect(Math.abs(placed.left - r1.left)).toBeLessThan(0.5);
  expect(Math.abs(placed.width - r1.width)).toBeLessThan(0.5);

  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        document.documentElement.dataset.motion = "reduced";
        (window as any).fired = 0;
        (window as any).ti.moveTo(document.getElementById("r2")).eventCallback("onComplete", () => {
          (window as any).fired++;
          resolve();
        });
      }),
  );
  const r2 = await rect(page, "#r2");
  const jumped = await rect(page, "#rind");
  expect(await page.evaluate(() => (window as any).fired)).toBe(1);
  expect(Math.abs(jumped.left - r2.left)).toBeLessThan(0.5);
  expect(Math.abs(jumped.width - r2.width)).toBeLessThan(0.5);
  await page.evaluate(() => (window as any).ti.revert());
  expect(await style(page, "#rind")).toBe("");
});

test("a tab indicator setup that throws while measuring rolls back and rethrows", async ({ open }) => {
  const page = await open("component-motion");
  const result = await page.evaluate(() => {
    const indicator = document.getElementById("ind")!;
    const measure = indicator.getBoundingClientRect;
    // The origin is written before the active tab is measured.
    indicator.getBoundingClientRect = () => {
      throw new Error("boom");
    };
    try {
      (window as any).CM.tabIndicator(indicator, document.getElementById("tabs"));
      return "no throw";
    } catch (error) {
      indicator.getBoundingClientRect = measure;
      return `${(error as Error).message}|${indicator.getAttribute("style") ?? ""}|${!!(window as any).gsap.context()}`;
    }
  });
  expect(result).toBe("boom||false");
  // A working build follows.
  await page.evaluate(() => (window as any).CM.tabIndicator(document.getElementById("ind"), document.getElementById("tabs")).revert());
  expect(await style(page, "#ind")).toBe("");
});

test("a tab that grows as it is selected retargets the slide instead of cutting it short", async ({ open }) => {
  const page = await open("component-motion");
  await page.evaluate(() => ((window as any).ti = (window as any).CM.tabIndicator(document.getElementById("ind"), document.getElementById("tabs"), { duration: 0.4 })));
  await page.waitForTimeout(100);
  const t1 = await rect(page, "#t1");
  await freeze(page);
  await page.evaluate(async () => {
    (window as any).ti.moveTo(document.getElementById("t3"));
    // A bolder or larger selected label changes the tab's width in the same task.
    document.getElementById("t3")!.style.width = "200px";
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await advance(page, 0.1);
  const t3 = await rect(page, "#t3");
  const mid = await rect(page, "#ind");
  expect(mid.left).toBeGreaterThan(t1.left + 1);
  expect(mid.left, "the resize snapped the indicator to the end").toBeLessThan(t3.left - 5);
  await release(page);
  await page.waitForTimeout(700);
  const landed = await rect(page, "#ind");
  expect(Math.abs(landed.left - t3.left)).toBeLessThan(0.5);
  expect(Math.abs(landed.width - t3.width)).toBeLessThan(0.5);
  await page.evaluate(() => (window as any).ti.revert());
});

test("a disclosure pre-collapsed inline by the server opens to its content and stays open", async ({ open }) => {
  const page = await open("component-motion");
  const result = await page.evaluate(async () => {
    document.body.insertAdjacentHTML("beforeend", '<div id="pre" style="height: 0px; overflow: hidden;"><p style="height:80px;margin:0">Server content</p></div>');
    const panel = document.getElementById("pre")!;
    const motion = (window as any).CM.disclosure(panel, { duration: 0.2 });
    motion.open();
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { height: panel.getBoundingClientRect().height, style: panel.getAttribute("style") ?? "" };
  });
  expect(result).toEqual({ height: 80, style: "" });
});

/** Builds `enterExit` on #ee: items rise in on back.out, then tumble down with rotation on exit. */
const buildEnterExit = (page: import("@playwright/test").Page, options: Record<string, unknown> = {}) =>
  page.evaluate((opts) => {
    const w = window as any;
    const box = document.getElementById("ee")!;
    const items = box.querySelectorAll(".ee-item");
    w.log = [];
    w.ee = w.CM.enterExit(
      (tl: any) =>
        tl
          .fromTo(box, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: "none" })
          .fromTo(items, { y: 40 }, { y: 0, duration: 0.6, ease: "back.out(3)" }),
      (tl: any) => tl.to(items, { y: 200, rotation: 30, duration: 0.5, ease: "power2.in" }).to(box, { autoAlpha: 0, duration: 0.1 }),
      { ...opts, onOpen: () => w.log.push("open"), onClose: () => w.log.push("close") },
    );
  }, options);

const eeState = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const w = window as any;
    return {
      phase: w.ee.phase(),
      log: w.log.join(","),
      y: Math.round(Number(w.gsap.getProperty("#e1", "y"))),
      rotation: Math.round(Number(w.gsap.getProperty("#e1", "rotation"))),
      visibility: getComputedStyle(document.getElementById("ee")!).visibility,
    };
  });

test("enterExit plays a separate exit from the open rest and replays the entrance after", async ({ open }) => {
  const page = await open("component-motion");
  await buildEnterExit(page);
  expect(await eeState(page)).toMatchObject({ phase: "closed", y: 40, visibility: "hidden" });

  await freeze(page);
  await page.evaluate(() => (window as any).ee.open());
  await advance(page, 0.3);
  expect(await eeState(page)).toMatchObject({ phase: "opening", visibility: "visible" });
  await advance(page, 0.6);
  expect(await eeState(page)).toMatchObject({ phase: "open", log: "open", y: 0, rotation: 0 });
  // Resting at the pause: time passing does not start the exit.
  await advance(page, 0.5);
  expect(await eeState(page)).toMatchObject({ phase: "open", y: 0 });

  await page.evaluate(() => (window as any).ee.close());
  await advance(page, 0.3);
  const exiting = await eeState(page);
  // The exit is its own motion: items fall past the open rest and rotate, unlike the entrance in reverse.
  expect(exiting.phase).toBe("closing");
  expect(exiting.y).toBeGreaterThan(0);
  expect(exiting.rotation).toBeGreaterThan(0);
  await advance(page, 0.5);
  // A finished exit rewinds to the entrance's closed start.
  expect(await eeState(page)).toMatchObject({ phase: "closed", log: "open,close", y: 40, rotation: 0, visibility: "hidden" });

  await page.evaluate(() => (window as any).ee.open());
  await advance(page, 1);
  expect(await eeState(page)).toMatchObject({ phase: "open", log: "open,close,open", y: 0 });
  await release(page);

  await page.evaluate(() => {
    (window as any).ee.revert();
    (window as any).ee.revert();
  });
  expect(await styleDeclarations(page, "#ee")).toEqual(await declared(page, "color:red"));
  expect(await style(page, "#e1")).toBe("");
  expect(await styleDeclarations(page, "#e2")).toEqual(await declared(page, "margin:2px"));
});

test("enterExit reverses an interrupted entrance and turns an interrupted exit back to open", async ({ open }) => {
  const page = await open("component-motion");
  await buildEnterExit(page, { reverseSpeed: 2 });
  await freeze(page);
  await page.evaluate(() => (window as any).ee.open());
  await advance(page, 0.4);
  await page.evaluate(() => (window as any).ee.close());
  await advance(page, 0.05);
  const turning = await eeState(page);
  // Back the way it came, never into the exit's tumble.
  expect(turning.phase).toBe("closing");
  expect(turning.rotation).toBe(0);
  await advance(page, 0.5);
  expect(await eeState(page)).toMatchObject({ phase: "closed", log: "close", y: 40, visibility: "hidden" });

  await page.evaluate(() => (window as any).ee.open());
  await advance(page, 1);
  await page.evaluate(() => (window as any).ee.close());
  await advance(page, 0.3);
  const exiting = await eeState(page);
  expect(exiting.rotation).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).ee.open());
  expect((await eeState(page)).phase).toBe("opening");
  await advance(page, 0.4);
  expect(await eeState(page)).toMatchObject({ phase: "open", log: "close,open,open", y: 0, rotation: 0, visibility: "visible" });
  await release(page);
  await page.evaluate(() => (window as any).ee.revert());
});

test("enterExit's reverseSpeed shortens a reversed entrance", async ({ open }) => {
  const page = await open("component-motion");
  // Real time: the held test clock does not realign a timeline whose timeScale changes as it reverses.
  const reversal = (speed: number) =>
    page.evaluate(async (reverseSpeed) => {
      const w = window as any;
      const box = document.getElementById("ee")!;
      let started = 0;
      let took = 0;
      const closed = new Promise<void>((resolve) => {
        w.ee = w.CM.enterExit(
          (tl: any) => tl.fromTo(box, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, ease: "none" }),
          (tl: any) => tl.to(box, { autoAlpha: 0, duration: 0.2 }),
          { reverseSpeed, onClose: () => ((took = performance.now() - started), resolve()) },
        );
      });
      w.ee.open();
      await new Promise((resolve) => setTimeout(resolve, 400));
      started = performance.now();
      w.ee.close();
      await closed;
      w.ee.revert();
      return took;
    }, speed);
  const normal = await reversal(1);
  const doubled = await reversal(2);
  expect(doubled).toBeLessThan(normal * 0.75);
});

test("enterExit's easeReverse changes the curve of a reversed entrance", async ({ open }) => {
  const page = await open("component-motion");
  /** How far the items travel back in the first 0.1s after a close interrupts the entrance at 0.5s. */
  const firstStep = async (options: Record<string, unknown>) => {
    await buildEnterExit(page, { reverseSpeed: 1, ...options });
    await freeze(page);
    await page.evaluate(() => (window as any).ee.open());
    await advance(page, 0.5);
    const before = Number(await page.evaluate(() => (window as any).gsap.getProperty("#e1", "y")));
    await page.evaluate(() => (window as any).ee.close());
    await advance(page, 0.1);
    const after = Number(await page.evaluate(() => (window as any).gsap.getProperty("#e1", "y")));
    await release(page);
    await page.evaluate(() => (window as any).ee.revert());
    return Math.abs(after - before);
  };
  const mirrored = await firstStep({});
  const eased = await firstStep({ easeReverse: "power3.in" });
  // power3.in eases out of the turn; the mirrored back.out would snap back at once.
  expect(mirrored).toBeGreaterThan(0.5);
  expect(eased).toBeLessThan(mirrored / 2);
});

test("enterExit under reduced motion jumps between rests and still calls back", async ({ open }) => {
  const page = await open("component-motion");
  await page.evaluate(() => (document.documentElement.dataset.motion = "reduced"));
  await buildEnterExit(page);
  await page.evaluate(() => (window as any).ee.open());
  expect(await eeState(page)).toMatchObject({ phase: "open", log: "open", y: 0, visibility: "visible" });
  await page.evaluate(() => (window as any).ee.close());
  expect(await eeState(page)).toMatchObject({ phase: "closed", log: "open,close", y: 40, rotation: 0, visibility: "hidden" });
  await page.evaluate(() => (window as any).ee.revert());
  expect(await styleDeclarations(page, "#ee")).toEqual(await declared(page, "color:red"));
  expect(await style(page, "#e1")).toBe("");
});

test("an enterExit whose entrance throws rolls back and rethrows", async ({ open }) => {
  const page = await open("component-motion");
  const result = await page.evaluate(() => {
    const w = window as any;
    const box = document.getElementById("ee")!;
    try {
      w.CM.enterExit(
        (tl: any) => {
          tl.fromTo(box, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 });
          throw new Error("entrance failed");
        },
        () => {},
      );
      return "no throw";
    } catch (error) {
      return `${(error as Error).message}|${box.style.cssText.replace(/\s|;/g, "")}|${!!w.gsap.context()}`;
    }
  });
  expect(result).toBe("entrance failed|color:red|false");
});

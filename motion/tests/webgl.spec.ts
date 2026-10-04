import { test, expect, style } from "./fixture";

// Recipes: animaxxing-webgl/references/recipes/{webgl-stage,image-planes,uniform-effects}.md
// Headless Chromium draws through SwiftShader. Checks cover lifecycle, fallbacks, uniforms, and sampled pixels.
test.use({ launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } });

type Page = import("@playwright/test").Page;

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/** Serves the CORS images and counts GL resource creation, deletion, and frames. */
const prepare = async (page: Page) => {
  await page.route("http://cors.test/**", (route) =>
    route.fulfill({
      body: PNG,
      contentType: "image/png",
      // An explicit mismatch: Playwright would otherwise allow the CORS copy.
      headers: { "Access-Control-Allow-Origin": route.request().url().endsWith("open.png") ? "*" : "http://elsewhere.test" },
    }),
  );
  await page.addInitScript(() => {
    const counts: Record<string, number> = {};
    (window as any).glCounts = counts;
    (window as any).shaderSources = [] as string[];
    const names = ["createTexture", "deleteTexture", "createBuffer", "deleteBuffer", "createProgram", "deleteProgram",
      "createShader", "deleteShader", "createVertexArray", "deleteVertexArray", "clear"];
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype] as any[]) {
      const shaderSource = proto.shaderSource;
      proto.shaderSource = function (shader: WebGLShader, source: string) {
        (window as any).shaderSources.push(source);
        return shaderSource.call(this, shader, source);
      };
      for (const name of names) {
        const original = proto[name];
        if (!original) continue;
        proto[name] = function (...args: unknown[]) {
          counts[name] = (counts[name] ?? 0) + 1;
          return original.apply(this, args);
        };
      }
    }
  });
};

const openWebgl = async (open: (f: string) => Promise<Page>, page: Page) => {
  await prepare(page);
  return open("webgl");
};

/** Builds a plane for each id and waits for its ready result. */
const planes = (page: Page, ids: string[], options = "{}") =>
  page.evaluate(
    async ([ids, o]) => {
      const w = window as any;
      w.planes ??= {};
      for (const id of ids) w.planes[id] = w.IP.imagePlane(document.getElementById(id), eval(`(${o})`));
      return Promise.all(ids.map((id) => w.planes[id].ready));
    },
    [ids, options] as const,
  );
const uniform = (page: Page, id: string, name: string) =>
  page.evaluate(([id, name]) => {
    const value = (window as any).planes[id].uniforms[name].value;
    return Array.isArray(value) ? [...value] : value;
  }, [id, name] as const);
const canvases = (page: Page) => page.locator("canvas[data-webgl-stage]").count();
const counts = (page: Page) => page.evaluate(() => ({ ...(window as any).glCounts }) as Record<string, number>);
const frames = async (page: Page) => (await counts(page)).clear ?? 0;
const cssText = (page: Page, id: string) => page.$eval(`#${id}`, (el) => (el as HTMLElement).style.cssText);
const opacity = (page: Page, id: string) => page.$eval(`#${id}`, (el) => (el as HTMLElement).style.opacity);
/** The extension is unavailable once lost, so the loss keeps it for the restore. */
const context = (page: Page, call: "loseContext" | "restoreContext") =>
  page.evaluate((call) => {
    const w = window as any;
    if (call === "loseContext") {
      const canvas = document.querySelector("canvas[data-webgl-stage]") as HTMLCanvasElement;
      w.loseExtension = (canvas.getContext("webgl2") ?? canvas.getContext("webgl"))!.getExtension("WEBGL_lose_context");
    }
    w.loseExtension[call]();
  }, call);

test("planes share one canvas, hide their images while drawing, and dispose everything on revert", async ({ open, page }) => {
  await openWebgl(open, page);
  const hoverStyle = await cssText(page, "hover");
  expect(await planes(page, ["a", "hover"])).toEqual([true, true]);
  expect(await canvases(page)).toBe(1);
  const canvas = page.locator("canvas[data-webgl-stage]");
  expect(await canvas.getAttribute("aria-hidden")).toBe("true");
  expect(await canvas.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  // The images stay in the accessibility tree, transparent while their planes draw.
  expect(await opacity(page, "a")).toBe("0");
  await expect(page.getByRole("img", { name: "Red field" })).toBeVisible();
  expect(await uniform(page, "a", "uRect")).toEqual([40, 40, 400, 250]);
  expect(await uniform(page, "a", "uUvScale")).toEqual([expect.closeTo(400 / 250 / (64 / 32), 5), 1]);

  const built = await counts(page);
  expect(built.createProgram).toBe(2);
  expect(built.createTexture).toBe(2);
  await page.evaluate(() => {
    const w = window as any;
    w.planes.a.revert();
    w.planes.a.revert();
  });
  expect(await opacity(page, "a")).toBe("");
  expect(await canvases(page)).toBe(1);

  await page.evaluate(() => (window as any).planes.hover.revert());
  expect(await canvases(page)).toBe(0);
  const after = await counts(page);
  for (const [create, remove] of [["createTexture", "deleteTexture"], ["createProgram", "deleteProgram"], ["createShader", "deleteShader"],
    ["createBuffer", "deleteBuffer"], ["createVertexArray", "deleteVertexArray"]]) {
    expect(after[remove], remove).toBe(after[create]);
  }
  expect(await cssText(page, "hover")).toBe(hoverStyle);
});

test("planes follow their images through scroll and resize, and the stage sleeps off screen", async ({ open, page }) => {
  await openWebgl(open, page);
  expect(await planes(page, ["a", "hover"])).toEqual([true, true]);
  await page.evaluate(() => window.scrollTo(0, 100));
  await expect.poll(async () => (await uniform(page, "a", "uRect"))[1]).toBe(-60);

  await page.setViewportSize({ width: 800, height: 600 });
  await expect.poll(() => uniform(page, "a", "uViewport")).toEqual([800, 600]);

  // Both images far off screen: the stage draws a clearing frame, then stops.
  await page.evaluate(() => window.scrollTo(0, 2000));
  await page.waitForTimeout(300);
  const idle = await frames(page);
  await page.waitForTimeout(300);
  expect(await frames(page)).toBe(idle);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => frames(page)).toBeGreaterThan(idle);
});

test("a hidden tab stops drawing until it returns", async ({ open, page }) => {
  await openWebgl(open, page);
  await planes(page, ["a"]);
  const setHidden = (hidden: boolean) =>
    page.evaluate((hidden) => {
      Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
      Object.defineProperty(document, "visibilityState", { value: hidden ? "hidden" : "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await setHidden(true);
  const hidden = await frames(page);
  await page.waitForTimeout(300);
  expect(await frames(page)).toBe(hidden);
  await setHidden(false);
  await expect.poll(() => frames(page)).toBeGreaterThan(hidden);
});

test("a lost context shows the images, and the restore rebuilds with the same uniforms", async ({ open, page }) => {
  await openWebgl(open, page);
  await planes(page, ["a"]);
  await page.evaluate(() => ((window as any).planes.a.uniforms.uHover.value = 0.7));
  const before = await counts(page);

  await context(page, "loseContext");
  await expect.poll(() => opacity(page, "a")).toBe("");
  expect(await page.evaluate(() => (window as any).planes.a.live())).toBe(false);
  const lost = await frames(page);
  await page.waitForTimeout(200);
  expect(await frames(page)).toBe(lost);

  await context(page, "restoreContext");
  await expect.poll(() => opacity(page, "a")).toBe("0");
  expect((await counts(page)).createProgram).toBe(before.createProgram + 1);
  expect((await counts(page)).createTexture).toBe(before.createTexture + 1);
  expect(await uniform(page, "a", "uHover")).toBe(0.7);
});

test("without WebGL the page is the untouched DOM", async ({ open, page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return /webgl/.test(type) ? null : (original as any).call(this, type, ...rest);
    } as any;
  });
  await openWebgl(open, page);
  expect(await planes(page, ["a", "hover"])).toEqual([false, false]);
  expect(await canvases(page)).toBe(0);
  expect(await page.evaluate(() => (window as any).planes.a.webgl)).toBe(false);
  expect(await style(page, "#a")).toBe("");
  const completed = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const w = window as any;
        const hover = w.UE.hoverDistortion(w.planes.hover);
        const wipe = w.UE.wipe(w.planes.a);
        wipe.enter().eventCallback("onComplete", () => {
          hover();
          wipe.revert();
          resolve(true);
        });
      }),
  );
  expect(completed).toBe(true);
});

test("reduced motion creates no canvas and completes wipes at once", async ({ open, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWebgl(open, page);
  expect(await planes(page, ["a"])).toEqual([false]);
  expect(await canvases(page)).toBe(0);
  const elapsed = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const w = window as any;
        const start = performance.now();
        const wipe = w.UE.wipe(w.planes.a, { duration: 2 });
        wipe.exit().then(() => resolve(performance.now() - start));
      }),
  );
  expect(elapsed).toBeLessThan(500);
  expect(await style(page, "#a")).toBe("");
});

test("images without CORS keep their DOM rendering; CORS images load a readable copy", async ({ open, page }) => {
  await openWebgl(open, page);
  expect(await planes(page, ["cors-open", "cors-closed"])).toEqual([true, false]);
  expect(await opacity(page, "cors-open")).toBe("0");
  expect(await opacity(page, "cors-closed")).toBe("");
  expect(await page.evaluate(() => [(window as any).planes["cors-open"].webgl, (window as any).planes["cors-closed"].webgl])).toEqual([true, false]);
  // Only the readable image became a texture.
  expect((await counts(page)).createTexture).toBe(1);
});

test("the hover lens follows the mouse, centers on keyboard focus, and ignores touch", async ({ open, page }) => {
  await openWebgl(open, page);
  await planes(page, ["hover"]);
  await page.evaluate(() => ((window as any).lens = (window as any).UE.hoverDistortion((window as any).planes.hover, { duration: 0.1, follow: 0.1 })));

  const box = (await page.locator("#hover").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await expect.poll(() => uniform(page, "hover", "uHover")).toBe(1);
  const [x, y] = await uniform(page, "hover", "uMouse");
  expect(x).toBeCloseTo(0.25, 1);
  expect(y).toBeCloseTo(0.75, 1);
  await page.mouse.move(900, 650);
  await expect.poll(() => uniform(page, "hover", "uHover")).toBe(0);

  await page.evaluate(() => {
    const target = document.getElementById("link")!;
    target.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "touch" }));
  });
  await page.waitForTimeout(200);
  expect(await uniform(page, "hover", "uHover")).toBe(0);

  await page.focus("#first");
  await page.keyboard.press("Tab");
  await expect.poll(() => uniform(page, "hover", "uHover")).toBe(1);
  expect(await uniform(page, "hover", "uMouse")).toEqual([0.5, 0.5]);
  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => uniform(page, "hover", "uHover")).toBe(0);

  // After revert, input changes nothing.
  await page.evaluate(() => (window as any).lens());
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.waitForTimeout(200);
  expect(await uniform(page, "hover", "uHover")).toBe(0);
});

test("the scroll wave bends with velocity within its limit and straightens at rest", async ({ open, page }) => {
  await openWebgl(open, page);
  await planes(page, ["hover"]);
  await page.evaluate(() => ((window as any).wave = (window as any).UE.scrollWave((window as any).planes.hover, { max: 30, settle: 0.2 })));
  let peak = 0;
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(30);
    peak = Math.max(peak, Math.abs(await uniform(page, "hover", "uVelocity")));
  }
  expect(peak).toBeGreaterThan(1);
  expect(peak).toBeLessThanOrEqual(30);
  await expect.poll(() => uniform(page, "hover", "uVelocity")).toBe(0);

  await page.evaluate(() => (window as any).wave());
  expect(await page.evaluate(() => (window as any).ST.getAll().length)).toBe(0);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(100);
  expect(await uniform(page, "hover", "uVelocity")).toBe(0);
});

test("the wipe starts hidden, enters, exits, and restores its uniform on revert", async ({ open, page }) => {
  await openWebgl(open, page);
  await planes(page, ["a"]);
  await page.evaluate(() => ((window as any).reveal = (window as any).UE.wipe((window as any).planes.a, { duration: 1 })));
  expect(await uniform(page, "a", "uProgress")).toBe(0);
  await page.evaluate(() => (window as any).reveal.enter().then(() => ((window as any).entered = true)));
  await expect.poll(() => page.evaluate(() => (window as any).entered)).toBe(true);
  expect(await uniform(page, "a", "uProgress")).toBe(1);
  // An exit mid-way turns back from where it is. Braces: a returned timeline is thenable and would be awaited.
  await page.evaluate(() => {
    (window as any).reveal.exit();
  });
  await page.waitForTimeout(300);
  const mid = await uniform(page, "a", "uProgress");
  expect(mid).toBeGreaterThan(0);
  expect(mid).toBeLessThan(1);
  await page.evaluate(() => (window as any).reveal.revert());
  expect(await uniform(page, "a", "uProgress")).toBe(1);
});

test("a shell hold keeps the canvas and context across page planes", async ({ open, page }) => {
  await openWebgl(open, page);
  await page.evaluate(() => ((window as any).shell = (window as any).WS.holdStage()));
  await planes(page, ["a"]);
  const first = await page.evaluate(() => ((window as any).firstCanvas = document.querySelector("canvas[data-webgl-stage]")) !== null);
  expect(first).toBe(true);
  await page.evaluate(() => (window as any).planes.a.revert());
  expect(await canvases(page)).toBe(1);
  expect(await planes(page, ["hover"])).toEqual([true]);
  expect(await page.evaluate(() => document.querySelector("canvas[data-webgl-stage]") === (window as any).firstCanvas)).toBe(true);
  await page.evaluate(() => {
    const w = window as any;
    w.planes.hover.revert();
    w.shell.release();
    w.shell.release();
  });
  expect(await canvases(page)).toBe(0);
});

test.describe("pixel budgets", () => {
  test.use({ deviceScaleFactor: 3 });

  test("desktop caps the ratio at 2 and honors a pixel budget", async ({ open, page }) => {
    await openWebgl(open, page);
    await planes(page, ["a"]);
    expect(await page.$eval("canvas[data-webgl-stage]", (c) => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height])).toEqual([2000, 1400]);
    await page.evaluate(() => (window as any).planes.a.revert());
    // A fresh stage with a smaller budget: 1000 × 700 at no more than 1 million pixels.
    await planes(page, ["hover"], "{ stage: { maxPixels: 1000000 } }");
    const [width, height] = await page.$eval("canvas[data-webgl-stage]", (c) => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height]);
    expect(width * height).toBeLessThanOrEqual(1_000_000);
  });
});

test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test("coarse pointers draw at 1.5", async ({ open, page }) => {
    await openWebgl(open, page);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await planes(page, ["a"]);
    expect(await page.$eval("canvas[data-webgl-stage]", (c) => (c as HTMLCanvasElement).width)).toBe(Math.floor(390 * 1.5));
  });
});

test("a plane deactivated while the stage sleeps still clears its pixels", async ({ open, page }) => {
  await openWebgl(open, page);
  await planes(page, ["a"]);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const asleep = await frames(page);
  await page.evaluate(() => window.scrollTo(0, 2000));
  // The observer deactivates the plane; the stage draws one clearing frame without waking.
  await expect.poll(() => frames(page)).toBe(asleep + 1);
});

test("a frame that throws hides the canvas, shows the images, and refuses new planes", async ({ open, page }) => {
  await openWebgl(open, page);
  await page.evaluate(() => ((window as any).shell = (window as any).WS.holdStage()));
  await planes(page, ["a"]);
  await page.evaluate(() => {
    const stage = (window as any).shell.stage;
    const bad = { build() {}, update() { throw new Error("bad layer"); }, dispose() {} };
    stage.add(bad);
    stage.setActive(bad, true);
  });
  await expect.poll(() => opacity(page, "a")).toBe("");
  expect(await page.$eval("canvas[data-webgl-stage]", (c) => (c as HTMLElement).style.display)).toBe("none");
  expect(await planes(page, ["hover"])).toEqual([false]);
  expect(await opacity(page, "hover")).toBe("");
});

/** Sample after GSAP draws, before the browser discards the default framebuffer. */
const pixelAt = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => new Promise<number[]>((resolve) => {
  const w = window as any;
  const sample = () => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-webgl-stage]")!;
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl"))!;
    const pixel = new Uint8Array(4);
    gl.readPixels(Math.floor(x * canvas.width / innerWidth), Math.floor((innerHeight - y) * canvas.height / innerHeight), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    w.gsap.ticker.remove(sample);
    resolve([...pixel]);
  };
  w.gsap.ticker.add(sample);
}), [x, y]);

for (const initiallyHidden of [false, true]) {
  test(`planes respect wrapper visibility without blocking readiness (initiallyHidden=${initiallyHidden})`, async ({ open, page }) => {
    await openWebgl(open, page);
    await page.evaluate((hidden) => {
      const image = document.getElementById("a")!;
      const wrapper = document.createElement("div");
      wrapper.id = "image-wrapper";
      image.before(wrapper);
      wrapper.append(image);
      wrapper.style.visibility = hidden ? "hidden" : "visible";
    }, initiallyHidden);
    expect(await planes(page, ["a"])).toEqual([true]);
    for (const visible of [!initiallyHidden, initiallyHidden, !initiallyHidden]) {
      await page.$eval("#image-wrapper", (el, visible) => { (el as HTMLElement).style.visibility = visible ? "visible" : "hidden"; }, visible);
      await expect.poll(() => pixelAt(page, 100, 100)).toEqual(visible ? [204, 51, 51, 255] : [0, 0, 0, 0]);
    }
    await page.evaluate(() => { (window as any).planes.a.revert(); (window as any).planes.a.revert(); });
    expect(await style(page, "#a")).toBe("");
    expect(await canvases(page)).toBe(0);
  });
}

test("default shaders use defined smoothstep edges and the lens changes rendered pixels", async ({ open, page }) => {
  await openWebgl(open, page);
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0, "black"); gradient.addColorStop(1, "white");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
    (document.getElementById("a") as HTMLImageElement).src = canvas.toDataURL();
  });
  await planes(page, ["a"]);
  // GLSL defines smoothstep only for increasing edges. Check the submitted shader,
  // since a permissive software driver can make reversed edges look correct.
  const constantEdges = await page.evaluate(() => (window as any).shaderSources.flatMap((source: string) =>
    [...source.matchAll(/smoothstep\(\s*([\d.]+)\s*,\s*([\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])])) as number[][]);
  expect(constantEdges.length).toBeGreaterThan(0);
  for (const [low, high] of constantEdges) expect(low).toBeLessThan(high);
  const before = await pixelAt(page, 300, 165);
  await page.evaluate(() => { (window as any).planes.a.uniforms.uHover.value = 1; });
  await expect.poll(async () => Math.abs((await pixelAt(page, 300, 165))[0]! - before[0]!)).toBeGreaterThan(3);
  await page.evaluate(() => { (window as any).planes.a.uniforms.uHover.value = 0; });
  await expect.poll(() => pixelAt(page, 300, 165)).toEqual(before);
  await page.evaluate(() => (window as any).planes.a.revert());
});

test("the glitch starts hidden, jumps pixels while it runs, settles clean, and restores its uniforms", async ({ open, page }) => {
  await openWebgl(open, page);
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0, "black"); gradient.addColorStop(1, "white");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
    (document.getElementById("a") as HTMLImageElement).src = canvas.toDataURL();
  });
  await planes(page, ["a"]);
  await page.evaluate(() => ((window as any).g = (window as any).UE.glitch((window as any).planes.a, { duration: 0.6 })));
  expect(await uniform(page, "a", "uProgress")).toBe(0);
  await page.evaluate(() => (window as any).g.enter().then(() => ((window as any).entered = true)));
  await expect.poll(() => page.evaluate(() => (window as any).entered)).toBe(true);
  expect(await uniform(page, "a", "uProgress")).toBe(1);
  expect(await uniform(page, "a", "uGlitch")).toBe(0);
  const rest = await pixelAt(page, 300, 165);
  // Held at full strength, some bands jump: sampled rows differ from the clean frame at some tick.
  const column = () => Promise.all(Array.from({ length: 14 }, (_, i) => pixelAt(page, 300, 100 + i * 12).then((p) => p[0]!)));
  const clean = await column();
  await page.evaluate(() => { (window as any).planes.a.uniforms.uGlitch.value = 1; });
  await expect.poll(async () => {
    const now = await column();
    return now.filter((value, i) => Math.abs(value - clean[i]!) > 3).length;
  }, { timeout: 6000 }).toBeGreaterThan(0);
  await page.evaluate(() => { (window as any).planes.a.uniforms.uGlitch.value = 0; });
  await expect.poll(() => pixelAt(page, 300, 165)).toEqual(rest);
  await page.evaluate(() => {
    (window as any).g.exit().then(() => ((window as any).gone = true));
  });
  await expect.poll(() => page.evaluate(() => (window as any).gone)).toBe(true);
  expect(await uniform(page, "a", "uProgress")).toBe(0);
  expect(await uniform(page, "a", "uGlitch")).toBe(0);
  await page.evaluate(() => (window as any).g.revert());
  expect(await uniform(page, "a", "uProgress")).toBe(1);
  expect(await uniform(page, "a", "uGlitch")).toBe(0);
  await page.evaluate(() => (window as any).planes.a.revert());
});

test("without WebGL the glitch's timelines finish at once with their callbacks", async ({ open, page }) => {
  await openWebgl(open, page);
  const result = await page.evaluate(async () => {
    const w = window as any;
    document.documentElement.dataset.motion = "reduced";
    const plane = w.IP.imagePlane(document.getElementById("a"));
    const g = w.UE.glitch(plane, { duration: 2 });
    const start = performance.now();
    const fired: string[] = [];
    await new Promise<void>((resolve) => g.enter().eventCallback("onComplete", () => (fired.push("enter"), resolve())));
    await new Promise<void>((resolve) => g.exit().eventCallback("onComplete", () => (fired.push("exit"), resolve())));
    g.revert();
    plane.revert();
    return { fired, ms: performance.now() - start, canvas: !!document.querySelector("canvas[data-webgl-stage]") };
  });
  expect(result.fired).toEqual(["enter", "exit"]);
  expect(result.ms).toBeLessThan(500);
  expect(result.canvas).toBe(false);
});

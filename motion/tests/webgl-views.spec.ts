import { test, expect, style } from "./fixture";

// Recipes: animaxxing-webgl/references/recipes/{framed-views,scene-flight,particle-morph,liquid-image}.md
// Headless Chromium draws through SwiftShader. Checks cover lifecycle, posters, fallbacks, counted GL resources, uniforms, and sampled pixels.
test.use({ launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } });

type Page = import("@playwright/test").Page;

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/** Serves an unreadable image and counts GL resource creation, deletion, and frames. */
const prepare = async (page: Page) => {
  await page.route("http://cors.test/**", (route) =>
    route.fulfill({ body: PNG, contentType: "image/png", headers: { "Access-Control-Allow-Origin": "http://elsewhere.test" } }),
  );
  await page.addInitScript(() => {
    const counts: Record<string, number> = {};
    (window as any).glCounts = counts;
    (window as any).shaderSources = [] as string[];
    const names = ["createTexture", "deleteTexture", "createBuffer", "deleteBuffer", "createProgram", "deleteProgram", "createShader", "deleteShader",
      "createVertexArray", "deleteVertexArray", "createFramebuffer", "deleteFramebuffer", "createRenderbuffer", "deleteRenderbuffer", "clear"];
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

const openViews = async (open: (f: string) => Promise<Page>, page: Page) => {
  await prepare(page);
  return open("webgl-views");
};

const canvases = (page: Page) => page.locator("canvas[data-webgl-stage]").count();
const counts = (page: Page) => page.evaluate(() => ({ ...(window as any).glCounts }) as Record<string, number>);
const frames = async (page: Page) => (await counts(page)).clear ?? 0;
const opacity = (page: Page, selector: string) => page.$eval(selector, (el) => (el as HTMLElement).style.opacity);
const PAIRS = [["createTexture", "deleteTexture"], ["createProgram", "deleteProgram"], ["createShader", "deleteShader"], ["createBuffer", "deleteBuffer"],
  ["createVertexArray", "deleteVertexArray"], ["createFramebuffer", "deleteFramebuffer"], ["createRenderbuffer", "deleteRenderbuffer"]];
const balanced = async (page: Page) => {
  const after = await counts(page);
  for (const [create, remove] of PAIRS) expect(after[remove!] ?? 0, remove).toBe(after[create!] ?? 0);
};

/** One canvas pixel at viewport coordinates, read in the frame the stage draws. */
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
/** Inked pixels in a viewport rectangle, with their average red and blue. */
const ink = (page: Page, left: number, top: number, right: number, bottom: number) => page.evaluate(([l, t, r, b]) => new Promise<{ n: number; red: number; blue: number }>((resolve) => {
  const w = window as any;
  const sample = () => {
    w.gsap.ticker.remove(sample);
    const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-webgl-stage]")!;
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl"))!;
    const sx = canvas.width / innerWidth;
    const sy = canvas.height / innerHeight;
    const width = Math.round((r - l) * sx);
    const height = Math.round((b - t) * sy);
    const px = new Uint8Array(width * height * 4);
    gl.readPixels(Math.round(l * sx), Math.round((innerHeight - b) * sy), width, height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let n = 0, red = 0, blue = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3]! > 40) { n++; red += px[i]!; blue += px[i + 2]!; }
    resolve({ n, red: n ? red / n : 0, blue: n ? blue / n : 0 });
  };
  w.gsap.ticker.add(sample);
}), [left, top, right, bottom]);
/** Red values along a row across an element's middle, read in a single drawn frame. */
const row = (page: Page, top: number) => page.evaluate((y) => new Promise<number[]>((resolve) => {
  const w = window as any;
  const sample = () => {
    w.gsap.ticker.remove(sample);
    const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-webgl-stage]")!;
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl"))!;
    const scale = canvas.width / innerWidth;
    const px = new Uint8Array(canvas.width * 4);
    gl.readPixels(0, Math.floor((innerHeight - y) * canvas.height / innerHeight), canvas.width, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const out: number[] = [];
    for (let x = 48; x < 440; x += 13) out.push(px[Math.floor(x * scale) * 4]!);
    resolve(out);
  };
  w.gsap.ticker.add(sample);
}), top);
const differs = (a: number[], b: number[]) => a.filter((v, i) => Math.abs(v - b[i]!) > 24).length;

const build = {
  flight: (page: Page, options = "{ images: window.cards }") =>
    page.evaluate((o) => {
      const w = window as any;
      w.ride = w.SF.flight(document.getElementById("flight"), eval(`(${o})`));
      return w.ride.view.ready;
    }, options),
  morph: (page: Page) =>
    page.evaluate(() => {
      const w = window as any;
      w.morph = w.PM.particleMorph(document.getElementById("morph"), { shapes: [w.PM.scatterShape(1500), w.PM.sphereShape(1500, 0.6)], count: 1500, size: 4 });
      return w.morph.view.ready;
    }),
  melt: (page: Page) =>
    page.evaluate(() => {
      const w = window as any;
      const host = document.getElementById("melt")!;
      w.metal = w.MB.melt(host, { draw: w.MB.drawText("Hi", "700 160px sans-serif"), poster: host.querySelector("h2"), drops: 10 });
      return w.metal.view.ready;
    }),
  liquid: (page: Page) =>
    page.evaluate(() => {
      const w = window as any;
      w.liquid = w.LI.liquidImage(document.getElementById("liquid"));
      return w.liquid.view.ready;
    }),
};

test("a flight draws in its element's box, hides its poster, and frees everything on revert", async ({ open, page }) => {
  await openViews(open, page);
  expect(await build.flight(page)).toBe(true);
  expect(await canvases(page)).toBe(1);
  // The poster stays in the accessibility tree, transparent while the view draws.
  expect(await opacity(page, "#flight img")).toBe("0");
  await expect(page.getByRole("img", { name: "Posters receding down a tunnel" })).toBeVisible();
  // The nearest card hangs right of center: red, premultiplied.
  await expect.poll(async () => (await pixelAt(page, 400, 165))[0]).toBeGreaterThan(120);
  const start = await row(page, 165);
  await page.evaluate(() => ((window as any).ride.uniforms.uTravel.value = 0.5));
  await expect.poll(async () => differs(await row(page, 165), start)).toBeGreaterThan(3);
  // Nothing drawn outside the element's box.
  expect((await pixelAt(page, 460, 165))[3]).toBe(0);

  await page.evaluate(() => {
    const w = window as any;
    w.ride.revert();
    w.ride.revert();
  });
  expect(await canvases(page)).toBe(0);
  expect(await style(page, "#flight img")).toBe("");
  await balanced(page);
});

test("scrolling flies the path, the pointer leans the camera, and touch never leans it", async ({ open, page }) => {
  await openViews(open, page);
  await build.flight(page);
  await page.evaluate(() => {
    const w = window as any;
    w.offScroll = w.SF.scrollFlight(w.ride, { trigger: document.getElementById("track"), start: "top bottom", end: "bottom bottom", scrub: true });
    w.offLean = w.SF.pointerLean(w.ride, { follow: 0.1 });
  });
  const travel = () => page.evaluate(() => (window as any).ride.uniforms.uTravel.value as number);
  const lean = () => page.evaluate(() => [...(window as any).ride.uniforms.uLean.value] as number[]);
  expect(await travel()).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(travel).toBeGreaterThan(0.05);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(60, 60);
  await page.mouse.move(430, 60, { steps: 4 });
  await expect.poll(async () => (await lean())[0]).toBeGreaterThan(0.6);
  await page.mouse.move(700, 600);
  await expect.poll(async () => Math.abs((await lean())[0]!)).toBeLessThan(0.02);

  await page.evaluate(() => {
    const host = document.getElementById("flight")!;
    for (const type of ["pointerover", "pointerenter", "pointermove"]) {
      host.dispatchEvent(new PointerEvent(type, { pointerType: "touch", clientX: 430, clientY: 60, bubbles: type !== "pointerenter" }));
    }
  });
  await page.waitForTimeout(200);
  expect((await lean())[0]).toBe(0);

  await page.evaluate(() => {
    const w = window as any;
    w.offScroll();
    w.offLean();
  });
  expect(await travel()).toBe(0);
  expect(await page.evaluate(() => (window as any).ST.getAll().length)).toBe(0);
  await page.evaluate(() => (window as any).ride.revert());
});

test("a morph gathers its points into the next shape, scatters, parts around the mouse, and frees everything", async ({ open, page }) => {
  await openViews(open, page);
  expect(await build.morph(page)).toBe(true);
  expect(await opacity(page, "#morph img")).toBe("0");
  // Each shape fits the element by its own bounds: wide dust reaches the element's left side, the round sphere
  // gathers in the middle, in the element's color.
  const side = () => ink(page, 48, 430, 110, 480);
  const middle = () => ink(page, 180, 395, 300, 515);
  expect((await side()).n).toBeGreaterThan(0);
  await page.evaluate(() => {
    (window as any).morph.to(1, { duration: 0 });
  });
  await expect.poll(async () => (await side()).n).toBe(0);
  const sphere = await middle();
  expect(sphere.n).toBeGreaterThan(200);
  expect(sphere.blue).toBeGreaterThan(sphere.red + 60);
  // Nothing drawn outside the element's box.
  expect((await ink(page, 445, 330, 520, 580)).n).toBe(0);

  await page.evaluate(() => ((window as any).morph.uniforms.uScatter.value = 3));
  await expect.poll(async () => (await middle()).n).toBeLessThan(sphere.n / 2);
  await page.evaluate(() => ((window as any).morph.uniforms.uScatter.value = 0));

  await page.evaluate(() => ((window as any).offPush = (window as any).PM.pointerPush((window as any).morph, { follow: 0.05 })));
  const push = () => page.evaluate(() => (window as any).morph.uniforms.uPush.value as number);
  await page.mouse.move(700, 455);
  await page.mouse.move(240, 455, { steps: 3 });
  await expect.poll(push).toBeGreaterThan(0.9);
  await page.mouse.move(700, 455);
  await expect.poll(push).toBeLessThan(0.02);
  await page.evaluate(() => (window as any).offPush());

  expect(await page.evaluate(() => [(window as any).PM.textShape("Hi").length > 30, (window as any).PM.textShape("Hi").length % 3])).toEqual([true, 0]);
  await page.evaluate(() => (window as any).morph.revert());
  expect(await canvases(page)).toBe(0);
  expect(await style(page, "#morph img")).toBe("");
  await balanced(page);
});

test("a liquid image bends under a mouse trail, settles back to the clean image, and pours one stroke", async ({ open, page }) => {
  await openViews(open, page);
  expect(await build.liquid(page)).toBe(true);
  expect(await opacity(page, "#liquid")).toBe("0");
  await expect(page.getByRole("img", { name: "Striped field" })).toBeVisible();
  const top = 620 + 125;
  await page.evaluate((y) => window.scrollTo(0, y - 350), top);
  const y = 350;
  const clean = await row(page, y);
  expect(new Set(clean).size).toBeGreaterThan(1);

  // Drive the mouse inside the page, one step per drawn frame, and read the row on the frame after the last
  // step: round trips from the test would let the trail fade on a loaded software renderer.
  const stirred = await page.evaluate((y) => new Promise<number[]>((resolve) => {
    const w = window as any;
    const image = document.getElementById("liquid")!;
    const at = (type: string, x: number) =>
      image.dispatchEvent(new PointerEvent(type, { pointerType: "mouse", clientX: x, clientY: y, bubbles: type !== "pointerenter" }));
    let x = 60;
    at("pointerenter", x);
    const step = () => {
      // Brisk steps: on a loaded renderer each frame spans more time, so short steps read as a slow drag.
      x += 60;
      if (x <= 420) return at("pointermove", x);
      w.gsap.ticker.remove(step);
      const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-webgl-stage]")!;
      const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl"))!;
      const scale = canvas.width / innerWidth;
      const px = new Uint8Array(canvas.width * 4);
      gl.readPixels(0, Math.floor((innerHeight - y) * canvas.height / innerHeight), canvas.width, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const out: number[] = [];
      for (let sx = 48; sx < 440; sx += 13) out.push(px[Math.floor(sx * scale) * 4]!);
      at("pointerleave", x);
      resolve(out);
    };
    w.gsap.ticker.add(step);
  }), y);
  expect(differs(stirred, clean)).toBeGreaterThan(2);
  await page.mouse.move(700, 650);
  await expect.poll(async () => differs(await row(page, y), clean), { timeout: 8000 }).toBe(0);

  // Return nothing: serializing a timeline back to the test would stall the page past the stroke.
  await page.evaluate(() => {
    (window as any).liquid.pour({ duration: 2 });
  });
  await expect.poll(async () => differs(await row(page, y), clean)).toBeGreaterThan(2);
  await expect.poll(async () => differs(await row(page, y), clean), { timeout: 8000 }).toBe(0);

  await page.evaluate(() => (window as any).liquid.revert());
  expect(await canvases(page)).toBe(0);
  expect(await style(page, "#liquid")).toBe("");
  await balanced(page);
});

test("a lost context shows the posters, and the restore rebuilds with the same uniforms", async ({ open, page }) => {
  await openViews(open, page);
  await build.morph(page);
  await page.evaluate(() => ((window as any).morph.uniforms.uShape.value = 0.75));
  const before = await counts(page);
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas[data-webgl-stage]") as HTMLCanvasElement;
    (window as any).lose = (canvas.getContext("webgl2") ?? canvas.getContext("webgl"))!.getExtension("WEBGL_lose_context");
    (window as any).lose.loseContext();
  });
  await expect.poll(() => opacity(page, "#morph img")).toBe("");
  expect(await page.evaluate(() => (window as any).morph.view.live())).toBe(false);
  await page.evaluate(() => (window as any).lose.restoreContext());
  await expect.poll(() => opacity(page, "#morph img")).toBe("0");
  // The drawing, its target, and the composite quad come back once each.
  expect((await counts(page)).createProgram).toBe(before.createProgram! + 2);
  expect((await counts(page)).createFramebuffer).toBe(before.createFramebuffer! + 1);
  expect(await page.evaluate(() => (window as any).morph.uniforms.uShape.value)).toBe(0.75);
  await page.evaluate(() => (window as any).morph.revert());
});

test("views off screen let the stage sleep", async ({ open, page }) => {
  await openViews(open, page);
  await build.flight(page);
  await page.evaluate(() => window.scrollTo(0, 2000));
  // Once the observer reports the view gone, no further frames are drawn.
  await expect.poll(async () => {
    const before = await frames(page);
    await page.waitForTimeout(300);
    return (await frames(page)) - before;
  }).toBe(0);
  const idle = await frames(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => frames(page)).toBeGreaterThan(idle);
  await page.evaluate(() => (window as any).ride.revert());
});

test("without WebGL the posters are the page, and morphs and pours complete at once", async ({ open, page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return /webgl/.test(type) ? null : (original as any).call(this, type, ...rest);
    } as any;
  });
  await openViews(open, page);
  expect(await Promise.all([build.flight(page), build.morph(page), build.liquid(page), build.melt(page)])).toEqual([false, false, false, false]);
  expect(await canvases(page)).toBe(0);
  for (const selector of ["#flight img", "#morph img", "#liquid"]) expect(await style(page, selector)).toBe("");
  const finished = await page.evaluate(() => new Promise<boolean[]>((resolve) => {
    const w = window as any;
    const effects = [w.SF.scrollFlight(w.ride), w.SF.pointerLean(w.ride), w.PM.pointerPush(w.morph)];
    const results: boolean[] = [];
    w.morph.to(1, { duration: 3, onComplete: () => results.push(w.morph.uniforms.uShape.value === 1) });
    w.liquid.pour({ duration: 3 }).eventCallback("onComplete", () => results.push(true));
    w.metal.form({ duration: 3 }).eventCallback("onComplete", () => results.push(true));
    gsap.delayedCall(0.2, () => {
      effects.forEach((revert: () => void) => revert());
      resolve(results);
    });
  }));
  expect(finished).toEqual([true, true, true]);
});

test("reduced motion creates no canvas and keeps every poster", async ({ open, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openViews(open, page);
  expect(await Promise.all([build.flight(page), build.morph(page), build.liquid(page)])).toEqual([false, false, false]);
  expect(await canvases(page)).toBe(0);
  expect(await style(page, "#liquid")).toBe("");
});

test("a flight whose images cannot be read keeps its poster", async ({ open, page }) => {
  await openViews(open, page);
  expect(await build.flight(page, `{ images: ["http://cors.test/closed.png"] }`)).toBe(false);
  expect(await style(page, "#flight img")).toBe("");
  expect((await counts(page)).createTexture ?? 0).toBe(0);
});

test("every submitted shader uses increasing smoothstep edges", async ({ open, page }) => {
  await openViews(open, page);
  await Promise.all([build.flight(page), build.morph(page), build.liquid(page), build.melt(page)]);
  const edges = await page.evaluate(() => (window as any).shaderSources.flatMap((source: string) =>
    [...source.matchAll(/smoothstep\(\s*([\d.]+)\s*,\s*([\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])])) as number[][]);
  expect(edges.length).toBeGreaterThan(2);
  for (const [low, high] of edges) expect(low).toBeLessThan(high);
  await page.evaluate(() => ["ride", "morph", "liquid", "metal"].forEach((name) => (window as any)[name].revert()));
});


test("a melt hides its live text, forms the shape in the element's tint, drips away, and frees everything", async ({ open, page }) => {
  await openViews(open, page);
  expect(await build.melt(page)).toBe(true);
  expect(await opacity(page, "#melt h2")).toBe("0");
  const box = () => ink(page, 560, 80, 840, 250);
  // Before it forms there is nothing to see.
  expect((await box()).n).toBe(0);
  await page.evaluate(() => new Promise<void>((resolve) => {
    (window as any).metal.form({ duration: 0.6 }).eventCallback("onComplete", () => resolve());
  }));
  await expect.poll(async () => (await box()).n).toBeGreaterThan(2000);
  const formed = await box();
  // Metal tinted by the element's color: blue light, not red.
  expect(formed.blue).toBeGreaterThan(formed.red);
  await page.evaluate(() => new Promise<void>((resolve) => {
    (window as any).metal.drip({ duration: 0.5 }).eventCallback("onComplete", () => resolve());
  }));
  await expect.poll(async () => (await box()).n).toBeLessThan(formed.n / 10);
  await page.evaluate(() => (window as any).metal.revert());
  expect(await style(page, "#melt h2")).toBe("");
  expect(await canvases(page)).toBe(0);
  await balanced(page);
});

test("a stream pours down its column as the page scrolls and climbs back when the page returns", async ({ open, page }) => {
  await openViews(open, page);
  await page.evaluate(() => {
    const w = window as any;
    w.stream = w.MB.pourStream(document.getElementById("column"), { rows: Array.from(document.querySelectorAll("#rows li")) as HTMLElement[] });
  });
  await expect.poll(() => page.evaluate(() => (window as any).stream.view.live())).toBe(true);
  const poured = async () => {
    const top = await page.$eval("#column", (el) => el.getBoundingClientRect().top);
    return ink(page, 460, Math.max(0, top), 500, 700);
  };
  // Scrolled so the column's top is high on screen, the stream reaches well down it.
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(async () => (await poured()).n).toBeGreaterThan(1500);
  const deep = (await poured()).n;
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(async () => (await poured()).n).toBeLessThan(deep);
  await page.evaluate(() => (window as any).stream.revert());
  expect(await canvases(page)).toBe(0);
  await balanced(page);
});

test("a clip box keeps a view's drawing inside it", async ({ open, page }) => {
  await openViews(open, page);
  expect(await page.evaluate(() => {
    const w = window as any;
    const host = document.getElementById("melt")!;
    w.metal = w.MB.melt(host, { draw: w.MB.drawText("Hi", "700 160px sans-serif"), poster: host.querySelector("h2"), drops: 10, clip: document.getElementById("clipbox") });
    return w.metal.view.ready;
  })).toBe(true);
  await page.evaluate(() => new Promise<void>((resolve) => {
    (window as any).metal.form({ duration: 0.3 }).eventCallback("onComplete", () => resolve());
  }));
  // The clip box covers the melt's left half: ink there, none past its right edge.
  await expect.poll(async () => (await ink(page, 560, 80, 700, 250)).n).toBeGreaterThan(500);
  expect((await ink(page, 704, 80, 840, 250)).n).toBe(0);
  await page.evaluate(() => (window as any).metal.revert());
  await balanced(page);
});

test("a stream in a scrolling box follows that box and stays inside it", async ({ open, page }) => {
  await openViews(open, page);
  await page.evaluate(() => {
    const w = window as any;
    const win = document.getElementById("win")!;
    w.stream = w.MB.pourStream(document.getElementById("wcol"), { rows: Array.from(win.querySelectorAll("li")) as HTMLElement[], scroller: win });
  });
  await expect.poll(() => page.evaluate(() => (window as any).stream.view.live())).toBe(true);
  // The page never scrolls, so only the box can move the head.
  const inside = () => ink(page, 950, 40, 990, 340);
  await expect.poll(async () => (await inside()).n).toBeGreaterThan(300);
  const shallow = (await inside()).n;
  await page.evaluate(() => document.getElementById("win")!.scrollTo(0, 400));
  await expect.poll(async () => (await inside()).n).toBeGreaterThan(shallow + 300);
  // The column runs on below the box, but nothing draws there.
  expect((await ink(page, 950, 344, 990, 700)).n).toBe(0);
  await page.evaluate(() => (window as any).stream.revert());
  expect(await canvases(page)).toBe(0);
  await balanced(page);
});

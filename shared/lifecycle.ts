import { test as base, expect, type Locator, type Page } from "@playwright/test";

export type Phase = "initial" | "intro" | "settled" | "outro" | "end";
export type PhaseEvent = { seq: number; path: string; phase: Phase | null; t: number };

type Fixtures = {
  /** Every data-phase change on any [data-page] element, across documents. */
  phases: PhaseEvent[];
};

/**
 * Records phase changes from inside the page through an exposed binding, so the
 * log survives full document navigations. Also accumulates layout shift so a
 * spec can assert the intro moved no layout boxes.
 */
export const test = base.extend<Fixtures>({
  phases: async ({ context }, use) => {
    const events: PhaseEvent[] = [];
    const delivered = new Set<number>();
    await context.exposeBinding("__animaxxPhase", (_source, event: PhaseEvent) => {
      // Events can arrive twice: once live, once replayed by the next document.
      if (delivered.has(event.seq)) return;
      delivered.add(event.seq);
      events.push(event);
      events.sort((a, b) => a.seq - b.seq);
    });
    await context.addInitScript(() => {
      const w = window as unknown as {
        __animaxxPhase: (e: PhaseEvent) => void;
        __animaxxCLS: number;
      };
      // A page that navigates synchronously after writing a phase, as a
      // reduced-motion outro does, can be torn down before the binding message
      // leaves it. Every event is also queued in sessionStorage, and the next
      // document replays whatever is still queued; the Node side dedupes by seq.
      const SEQ = "__animaxxSeq";
      const QUEUE = "__animaxxQueue";
      const readQueue = (): PhaseEvent[] => {
        try {
          return JSON.parse(sessionStorage.getItem(QUEUE) ?? "[]");
        } catch {
          return [];
        }
      };
      const writeQueue = (q: PhaseEvent[]) => {
        try {
          sessionStorage.setItem(QUEUE, JSON.stringify(q));
        } catch {
          /* storage unavailable: live delivery only */
        }
      };
      for (const e of readQueue()) w.__animaxxPhase(e);
      writeQueue([]);

      const seen = new WeakSet<Element>();
      const emit = (phase: string | null) => {
        let seq = 0;
        try {
          seq = Number(sessionStorage.getItem(SEQ) ?? "0") + 1;
          sessionStorage.setItem(SEQ, String(seq));
        } catch {
          seq = performance.timeOrigin + performance.now();
        }
        const event: PhaseEvent = {
          seq,
          path: location.pathname,
          phase: phase as Phase | null,
          t: performance.now(),
        };
        writeQueue([...readQueue(), event]);
        w.__animaxxPhase(event);
      };
      const scan = () => {
        document.querySelectorAll("[data-page]").forEach((el) => {
          if (!seen.has(el)) {
            seen.add(el);
            emit(el.getAttribute("data-phase"));
          }
        });
      };
      new MutationObserver((records) => {
        records.forEach((r, i) => {
          if (r.type !== "attributes") return scan();
          // A record carries the value from before the change, not after. When
          // several changes to one element land in one batch, the element
          // already holds the last of them, so the value this record produced
          // is the next record's old value.
          const next = records.find(
            (later, j) => j > i && later.type === "attributes" && later.target === r.target,
          );
          emit(next ? next.oldValue : (r.target as Element).getAttribute("data-phase"));
        });
      }).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ["data-phase"],
      });
      scan();

      w.__animaxxCLS = 0;
      if ("PerformanceObserver" in window) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & {
            hadRecentInput?: boolean;
            value?: number;
          })[]) {
            if (!entry.hadRecentInput) w.__animaxxCLS += entry.value ?? 0;
          }
        }).observe({ type: "layout-shift", buffered: true });
      }
    });
    await use(events);
  },
});

export { expect };

/** The one page that is currently laid out and visible. */
export function visiblePage(page: Page): Locator {
  return page.locator("[data-page]:visible");
}

export function phaseOf(page: Page): Promise<string | null> {
  return visiblePage(page).first().getAttribute("data-phase");
}

export async function waitForPhase(page: Page, phase: Phase, timeout = 5000) {
  await expect(visiblePage(page).first()).toHaveAttribute("data-phase", phase, { timeout });
}

export async function readCLS(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __animaxxCLS: number }).__animaxxCLS ?? 0);
}

/**
 * Every intro target on the visible page is visible and carries none of the
 * inline styles GSAP would leave behind if the settled state were not cleared.
 */
export async function expectSettledClean(page: Page) {
  await waitForPhase(page, "settled");
  const offenders = await visiblePage(page)
    .first()
    .evaluate((root) => {
      const out: string[] = [];
      root.querySelectorAll<HTMLElement>("[data-intro]").forEach((el) => {
        const cs = getComputedStyle(el);
        const inline = el.style;
        const leftover = ["transform", "opacity", "visibility", "will-change"].filter(
          (p) => inline.getPropertyValue(p) !== "",
        );
        if (cs.visibility !== "visible" || Number(cs.opacity) < 0.999 || leftover.length) {
          out.push(
            `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}: visibility=${cs.visibility} opacity=${cs.opacity} inline=[${leftover.join(",")}]`,
          );
        }
      });
      return out;
    });
  expect(offenders, "intro targets left dirty at settled").toEqual([]);
}

/** All intro targets are readable right now, whatever the phase. */
export async function expectReadable(page: Page) {
  const hidden = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-intro]"))
      .filter((el) => {
        const cs = getComputedStyle(el);
        return cs.visibility !== "visible" || Number(cs.opacity) < 0.999 || cs.display === "none";
      })
      .map((el) => el.tagName.toLowerCase()),
  );
  expect(hidden, "intro targets not readable").toEqual([]);
}

/** Phase events for one path, in order. */
export function phasesFor(events: PhaseEvent[], path: string): (Phase | null)[] {
  return events.filter((e) => e.path === path).map((e) => e.phase);
}

/**
 * Wall time between the first occurrence of two phases on one path. Both events
 * must come from the same document, since `t` is that document's clock.
 */
export function durationBetween(events: PhaseEvent[], path: string, from: Phase, to: Phase): number {
  const a = events.find((e) => e.path === path && e.phase === from);
  const b = events.find((e) => e.path === path && e.phase === to && a && e.seq > a.seq && e.t >= a.t);
  if (!a || !b) return NaN;
  return b.t - a.t;
}

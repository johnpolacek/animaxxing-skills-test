import { notFound } from "next/navigation";
import { PageMotion } from "@/components/motion/PageMotion";
import { TransitionLink } from "@/components/motion/TransitionLink";
import { ITEMS } from "../items";

/** Every item is known ahead of time, so all three pages prerender. */
export function generateStaticParams() {
  return ITEMS.map((item) => ({ n: String(item.n) }));
}

export default async function ItemPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const item = ITEMS.find((candidate) => String(candidate.n) === n);
  if (!item) notFound();

  return (
    <PageMotion>
      <main className="page page--wide">
        <h1 data-intro>Item {item.n}</h1>
        {/*
          The hero is the thumbnail's counterpart: same `data-shared`, same
          `data-flip-id`. It is not an intro target and is never hidden before
          paint, so it is laid out at its final size when the morph plays onto
          it, and it is simply there without JavaScript or under reduced motion.
        */}
        <figure className="hero-figure">
          <div
            className={`swatch swatch--${item.n}`}
            data-shared={`item-${item.n}`}
            data-flip-id={`item-${item.n}`}
            data-shared-hero
          />
          <figcaption data-intro>{item.title}</figcaption>
        </figure>
        <p data-intro>{item.blurb}</p>
        <p data-intro>
          <TransitionLink data-testid="gallery-back" href="/gallery">
            Back to the gallery
          </TransitionLink>
        </p>
        <section className="notes notes--item" data-intro aria-labelledby="item-notes">
          <h2 id="item-notes">Notes on reserved space</h2>
          <p>
            The {item.title.toLowerCase()} arrived as a thumbnail and grew into this box without a
            cut: the same element, captured before it left the gallery and played once this page had
            its layout.
          </p>
          <p>
            The hero reserves its size in CSS, so it is visible at full size before the heading and
            text rise in. Under reduced motion it is simply there.
          </p>
          <p>
            The rest of the page scrolls, so a wheel here has somewhere to go, and the back link
            takes the ordinary transition.
          </p>
        </section>
      </main>
    </PageMotion>
  );
}

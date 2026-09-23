import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { galleryItem } from "../../gallery";
import { PageMotion } from "../../motion/PageMotion";

export const Route = createFileRoute("/gallery/$n")({
  loader: ({ params }) => {
    const item = galleryItem(params.n);
    if (!item) throw notFound();
    return item;
  },
  component: ItemPage,
});

/**
 * The hero reserves its size in CSS and is visible at full size from the first
 * paint: it is not an intro target and never hidden before paint. When the
 * reader arrived from a thumbnail, the root controller morphs it from that
 * thumbnail's box; otherwise it is simply there.
 */
function ItemPage() {
  const item = Route.useLoaderData();
  return (
    // Keyed on the presented params: a move from one item straight to the next
    // reuses this route component, and the key gives the lifecycle a fresh
    // mount instead of DOM that already holds settled values.
    <PageMotion key={item.n}>
      <main className="page page--wide">
        <h1 data-intro>Item {item.n}</h1>
        <figure className="hero-figure">
          <div
            className={`swatch swatch--${item.n}`}
            data-shared={`item-${item.n}`}
            data-flip-id={`item-${item.n}`}
            data-shared-hero=""
          />
          <figcaption data-intro>{item.title}</figcaption>
        </figure>
        <p data-intro>{item.body}</p>
        <p data-intro>
          <Link to="/gallery" data-testid="gallery-back">
            Back to the gallery
          </Link>
        </p>
        <section className="notes notes--item" data-intro aria-labelledby="item-notes">
          <h2 id="item-notes">Notes on reserved space</h2>
          <p>
            This study arrived as a thumbnail and grew into this box without a cut: the same
            element, captured before it left the gallery and played once this page had its layout.
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

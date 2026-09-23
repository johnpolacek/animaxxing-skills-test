import { Link, useParams } from "react-router";
import { PageMotion } from "../motion/PageMotion";
import { galleryItem } from "./gallery-items";

export function meta({ params }: { params: { n?: string } }) {
  const item = galleryItem(params.n);
  return [{ title: item ? `Item ${item.n} | Lifecycle` : "Not found | Lifecycle" }];
}

/**
 * One route module for `/gallery/1` to `/gallery/3`. Moving between two items
 * reuses this element with new params, which is why the page controller keys
 * its lifecycle on the pathname.
 *
 * The hero reserves its size in CSS and is not an intro target, so it is
 * visible at full size before the heading and text rise in, and Flip alone owns
 * it while it morphs from the thumbnail. Under reduced motion it is simply there.
 */
export default function GalleryItemRoute() {
  const item = galleryItem(useParams().n);

  if (!item) {
    return (
      <PageMotion>
        <main className="page">
          <h1 data-intro>Not found</h1>
          <p data-intro>
            There is no such item. <Link to="/gallery" data-testid="gallery-back">Back to the gallery</Link>.
          </p>
        </main>
      </PageMotion>
    );
  }

  return (
    <PageMotion>
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
        <p data-intro>{item.blurb}</p>
        <p data-intro>
          <Link to="/gallery" prefetch="intent" data-testid="gallery-back">
            Back to the gallery
          </Link>
        </p>
        <section className="notes notes--item" data-intro aria-labelledby="item-notes">
          <h2 id="item-notes">Notes on reserved space</h2>
          <p>
            The {item.title.toLowerCase()} arrived as a thumbnail and grew into this box without a
            cut: the same picture, captured before it left the gallery and played once this page
            had its layout.
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

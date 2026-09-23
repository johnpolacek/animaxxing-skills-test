import { PageMotion } from "../motion/PageMotion";
import { TransitionLink } from "../motion/TransitionLink";
import { GALLERY_ITEMS } from "./gallery-items";

export function meta() {
  return [{ title: "Gallery | Lifecycle" }];
}

/**
 * Each thumbnail carries `data-shared` for the site and `data-flip-id` for
 * Flip, with the same value as the hero it opens into. It is never an intro
 * target, so nothing hides or moves it but the morph; the link around it is,
 * so the grid fades in with the page and the clicked one stays lit while the
 * rest leave.
 */
export default function GalleryRoute() {
  return (
    <PageMotion>
      <main className="page page--wide">
        <h1 data-intro>Gallery</h1>
        <p data-intro>
          Three studies in reserved space. Each opens into its own page, and the picture you choose
          travels there.
        </p>
        <ul className="gallery" role="list">
          {GALLERY_ITEMS.map((item) => (
            <li key={item.n}>
              <TransitionLink
                to={`/gallery/${item.n}`}
                transition="shared"
                prefetch="intent"
                className="gallery-item"
                data-intro
                data-testid={`gallery-item-${item.n}`}
              >
                <span
                  className={`swatch swatch--${item.n}`}
                  data-shared={`item-${item.n}`}
                  data-flip-id={`item-${item.n}`}
                />
                <span className="gallery-caption">
                  Item {item.n} — {item.title}
                </span>
              </TransitionLink>
            </li>
          ))}
        </ul>
        <section className="notes notes--gallery" data-intro aria-labelledby="gallery-notes">
          <h2 id="gallery-notes">Notes on reserved space</h2>
          <p>
            Every picture on this page has its box before it has its pixels. The grid is laid out
            from plain CSS, so a slow image never moves a caption, and a thumbnail that travels to
            its own page leaves from exactly where it sat.
          </p>
          <p>
            The scroll you are using now is eased by a scroller the root route owns. Pages never
            create or stop it; the boundary holds it still while a page leaves and hands it back
            once the next one has settled.
          </p>
          <p>
            Back and forward return to the position you left, not to the top and not to where the
            other page was. The next turn of the wheel continues from there.
          </p>
          <p>Nothing below this line animates on arrival. It is here so the page has somewhere to go.</p>
        </section>
      </main>
    </PageMotion>
  );
}

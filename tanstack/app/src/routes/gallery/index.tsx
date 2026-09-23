import { createFileRoute, Link } from "@tanstack/react-router";
import { GALLERY_ITEMS } from "../../gallery";
import { PageMotion } from "../../motion/PageMotion";
import { useRouteTransition } from "../../motion/RouteTransition";

export const Route = createFileRoute("/gallery/")({
  component: GalleryPage,
});

/**
 * Thumbnails and heroes are plain blocks that reserve their size in CSS. The
 * shared element carries `data-shared` for the site and `data-flip-id` for
 * Flip; it is never an intro target, so the page's stagger never moves it and
 * Flip alone owns it during a morph. The link around it is the intro target.
 */
function GalleryPage() {
  const { requestTransition } = useRouteTransition();
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
              <Link
                className="gallery-item"
                data-intro
                data-testid={`gallery-item-${item.n}`}
                to="/gallery/$n"
                params={{ n: item.n }}
                // The router still handles the click; this only records that
                // the thumbnail travels, so the controller captures it in the
                // outro and the item page morphs its hero from that box.
                onClick={(event) => {
                  const element = event.currentTarget.querySelector<HTMLElement>("[data-shared]");
                  if (element) requestTransition(event, `/gallery/${item.n}`, { kind: "shared", element });
                }}
              >
                <span
                  className={`swatch swatch--${item.n}`}
                  data-shared={`item-${item.n}`}
                  data-flip-id={`item-${item.n}`}
                />
                <span className="gallery-caption">
                  Item {item.n} — {item.title}
                </span>
              </Link>
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
            The scroll you are using now is eased by a scroller the shell owns. Pages never create
            or stop it; the controller holds it still while a page leaves and hands it back once the
            next one has settled.
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

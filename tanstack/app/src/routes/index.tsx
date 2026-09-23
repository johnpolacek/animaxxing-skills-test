import { createFileRoute, Link } from "@tanstack/react-router";
import { PageMotion } from "../motion/PageMotion";
import { useRouteTransition } from "../motion/RouteTransition";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { requestTransition } = useRouteTransition();
  return (
    <PageMotion>
      <main className="page">
        <h1 data-intro>A studio for small, deliberate things</h1>
        <p data-intro>
          We build sites that load fast, read well, and behave the same on the tenth visit as on the
          first. Nothing here is decorative for its own sake.
        </p>
        <p data-intro>
          Every page is laid out with ordinary CSS before anything moves, so the content is legible
          the moment the document arrives.
        </p>
        <p data-intro>
          Start with the{" "}
          <Link
            to="/work"
            data-testid="curtain-link"
            // The router still handles the click; this only records that the
            // navigation it starts takes the curtain.
            onClick={(event) => requestTransition(event, "/work", { kind: "curtain" })}
          >
            work
          </Link>
          , browse the{" "}
          <Link to="/gallery" data-testid="home-gallery">
            gallery
          </Link>
          , or read a little about how the studio came together.
        </p>
      </main>
    </PageMotion>
  );
}

import { Link } from "react-router";
import { PageMotion } from "../motion/PageMotion";
import { TransitionLink } from "../motion/TransitionLink";

export function meta() {
  return [{ title: "Lifecycle" }];
}

export default function HomeRoute() {
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
          <TransitionLink to="/work" transition="curtain" prefetch="intent" data-testid="curtain-link">
            work
          </TransitionLink>
          , browse the{" "}
          <Link to="/gallery" prefetch="intent" data-testid="home-gallery">
            gallery
          </Link>
          , or read a little about how the studio came together.
        </p>
      </main>
    </PageMotion>
  );
}

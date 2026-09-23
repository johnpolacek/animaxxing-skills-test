import { PageMotion } from "@/components/motion/PageMotion";
import { TransitionLink } from "@/components/motion/TransitionLink";

export default function HomePage() {
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
          <TransitionLink href="/work" transition="curtain" data-testid="curtain-link">
            work
          </TransitionLink>
          , browse the{" "}
          <TransitionLink href="/gallery" data-testid="home-gallery">
            gallery
          </TransitionLink>
          , or read a little about how the studio came together.
        </p>
      </main>
    </PageMotion>
  );
}

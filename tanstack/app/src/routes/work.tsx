import { createFileRoute } from "@tanstack/react-router";
import { PageMotion } from "../motion/PageMotion";

export const Route = createFileRoute("/work")({
  component: WorkPage,
});

function WorkPage() {
  return (
    <PageMotion>
      <main className="page">
        <h1 data-intro>Selected work</h1>
        <p data-intro>
          An archive for a paper mill, a booking tool for a chamber orchestra, and a reading app
          that refuses to notify you about anything. Three very different clients, one shared brief.
        </p>
        <p data-intro>
          Case studies are written after launch, once we know which decisions actually held up.
        </p>
        <p data-intro>Ask us about the ones that did not.</p>
      </main>
    </PageMotion>
  );
}

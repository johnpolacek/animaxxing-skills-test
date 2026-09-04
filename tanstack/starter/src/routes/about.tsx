import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="page">
      <h1>About the studio</h1>
      <p>
        Four people, one room, and a long-standing argument about whether a page should ever move
        without being asked. The argument is unresolved and the room is quiet.
      </p>
      <p>
        We take on a handful of projects a year. Each one gets the whole team rather than a slice of
        it, which is the only scheduling trick we have.
      </p>
    </main>
  );
}

import { PageMotion } from "../motion/PageMotion";

export function meta() {
  return [{ title: "About | Lifecycle" }];
}

export default function AboutRoute() {
  return (
    <PageMotion>
      <main className="page">
        <h1 data-intro>About the studio</h1>
        <p data-intro>
          Four people, one room, and a long-standing argument about whether a page should ever move
          without being asked. The argument is unresolved and the room is quiet.
        </p>
        <p data-intro>
          We take on a handful of projects a year. Each one gets the whole team rather than a slice
          of it, which is the only scheduling trick we have.
        </p>
      </main>
    </PageMotion>
  );
}

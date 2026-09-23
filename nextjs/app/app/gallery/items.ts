/** The three studies the gallery shows. Static, so both routes prerender. */
export const ITEMS = [
  {
    n: 1,
    title: "Archive reader",
    blurb:
      "A reading app for a national archive, where every transition had to survive a slow connection and a screen reader.",
  },
  {
    n: 2,
    title: "Booking flow",
    blurb: "An events site with a booking flow that never once moved a button out from under a thumb.",
  },
  {
    n: 3,
    title: "Documentation search",
    blurb: "A documentation platform whose search results animate in but stay copyable the whole time.",
  },
] as const;

export type Item = (typeof ITEMS)[number];

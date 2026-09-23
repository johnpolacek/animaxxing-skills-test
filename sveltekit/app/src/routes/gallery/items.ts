/** The three gallery items. Each thumbnail on /gallery morphs into its hero on /gallery/[n]. */
export const ITEMS = [
  { n: 1, title: "Archive reader", blurb: "A reading app for a national archive, where every transition had to survive a slow connection and a screen reader." },
  { n: 2, title: "Booking flow", blurb: "A booking tool for a chamber orchestra: four steps, one shared element, and no spinner anywhere." },
  { n: 3, title: "Documentation search", blurb: "Search for a documentation site that answers before the results page has finished arriving." },
] as const;

export type Item = (typeof ITEMS)[number];

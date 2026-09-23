/** The three gallery items. Thumbnail and hero share `item-N` as their `data-shared` and `data-flip-id`. */
export const galleryItems = [
  {
    n: 1,
    title: "Archive reader",
    summary: "A reading app for a national archive, where every transition had to survive a slow connection and a screen reader.",
  },
  {
    n: 2,
    title: "Booking flow",
    summary: "An events site with a booking flow that never once moved a button out from under a thumb.",
  },
  {
    n: 3,
    title: "Documentation search",
    summary: "A documentation platform whose search results animate in but stay copyable the whole time.",
  },
] as const;

export type GalleryItem = (typeof galleryItems)[number];

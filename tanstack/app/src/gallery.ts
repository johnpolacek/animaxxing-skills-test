/** The three gallery studies. `n` is a string because route params are. */
export type GalleryItem = {
  n: "1" | "2" | "3";
  title: string;
  body: string;
};

export const GALLERY_ITEMS: readonly GalleryItem[] = [
  {
    n: "1",
    title: "Archive reader",
    body: "A reading app for a national archive, where every transition had to survive a slow connection and a screen reader.",
  },
  {
    n: "2",
    title: "Booking flow",
    body: "A booking tool for a chamber orchestra: four steps, one form, and no page that ever moved under a pointer.",
  },
  {
    n: "3",
    title: "Documentation search",
    body: "Search for a documentation site that returns before the keyboard finishes the word, and reads the same in every browser.",
  },
];

export function galleryItem(n: string): GalleryItem | undefined {
  return GALLERY_ITEMS.find((item) => item.n === n);
}

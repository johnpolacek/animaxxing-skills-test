import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";
import { ITEMS } from "../items";

export const load: PageLoad = ({ params }) => {
  const item = ITEMS.find((candidate) => String(candidate.n) === params.n);
  if (!item) error(404, "No such item");
  return { item };
};

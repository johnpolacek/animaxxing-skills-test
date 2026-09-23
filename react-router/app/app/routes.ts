import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("about", "routes/about.tsx"),
  route("work", "routes/work.tsx"),
  route("gallery", "routes/gallery.tsx"),
  route("gallery/:n", "routes/gallery-item.tsx"),
] satisfies RouteConfig;

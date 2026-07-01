import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("s/:code", "routes/s.$code.tsx"),
] satisfies RouteConfig;

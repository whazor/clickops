import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { remixRoutes } from "remix-routes/vite";
import { flatRoutes } from "remix-flat-routes";

installGlobals();

export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ["**/*"],
      routes: async (defineRoutes) => flatRoutes("routes", defineRoutes),
    }),
    tsconfigPaths(),
    remixRoutes(),
  ],
});

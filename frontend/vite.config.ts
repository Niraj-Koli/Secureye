import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // The browser only ever talks to this origin; /api (HTTP and WebSocket) and the admin site
  // are forwarded to FastAPI, so cookies stay first-party and no CORS preflights are needed.
  const target = env.API_PROXY_TARGET || "http://localhost:8000";
  const proxy = {
    "/api": { target, ws: true },
    "/admin": { target },
  };

  return {
    plugins: [react()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 4173, strictPort: true, proxy },
  };
});

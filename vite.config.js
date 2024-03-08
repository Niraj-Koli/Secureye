import { defineConfig } from "vite";
import { resolve } from 'path'

import react from "@vitejs/plugin-react-swc";

export default defineConfig({
    plugins: [react()],
    // resolve: {
    //     alias: {
    //         // "@": new URL("./src", import.meta.url).pathname,
    //          [{ find: "@", replacement: resolve(__dirname, "./src") }],
        
        
    //     },
    // },
    resolve: {
        alias: [{ find: "@", replacement: resolve(__dirname, "./src") }]
      },
    build: {
        manifest: true,
        rollupOptions: {
            assetFileNames: () => {
                return "assets/css/index.min.css";
            },
            entryFileNames: () => {
                return "assets/js/[name].min.js";
            },
        },
    },
});

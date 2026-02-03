import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    // lovable-tagger only in development
    mode === "development" && componentTagger(),
    // PWA plugin: pre-cache build files and enable SPA navigation fallback
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      strategies: "generateSW",
      includeAssets: [
        "favicon.svg",
        "favicon.ico",
        "robots.txt",
        "apple-touch-icon.png"
      ],
      manifest: {
        name: "Studio Timepiece",
        short_name: "Timepiece",
        description: "A studio clock running on the local computer clock",
        theme_color: "#ffffff",
        display: "standalone",
        background_color: "#ffffff",
        icons: [
          { src: "icons/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/pwa-512x512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        // Precache JS/CSS/HTML/images produced by the build
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json}"],
        // Ensure SPA navigation works when offline
        navigateFallback: "/index.html"
      },
      devOptions: {
        // allows testing SW during dev with vite preview/dev server
        enabled: true,
        type: "module"
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
}));

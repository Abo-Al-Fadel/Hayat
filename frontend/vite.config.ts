import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Replaces the Create React App toolchain, which is end-of-life and was the source of
 * essentially every npm advisory in this project.
 *
 * The existing `REACT_APP_*` environment contract is kept deliberately: `envPrefix`
 * makes Vite read those variables, and `define` keeps `process.env.REACT_APP_*`
 * working in source. That avoids touching every call site and keeps the documented
 * `.env` file valid.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ["VITE_", "REACT_APP_"]);

  return {
    plugins: [react()],

    // Accept both the legacy CRA prefix and Vite's own.
    envPrefix: ["VITE_", "REACT_APP_"],

    define: {
      "process.env.REACT_APP_API_BASE": JSON.stringify(env.REACT_APP_API_BASE ?? ""),
      "process.env.NODE_ENV": JSON.stringify(mode),
    },

    server: {
      port: 3000,
      strictPort: false,
      open: false,
    },

    preview: {
      port: 3000,
    },

    build: {
      outDir: "build", // keep the CRA output path so deploy scripts keep working
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
    },

    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/setupTests.ts"],
      css: false,
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      // Playwright owns end-to-end; keep it out of the unit run.
      exclude: ["e2e/**", "node_modules/**"],
    },
  };
});

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

  /**
   * .env file first, then the real environment.
   *
   * CI passes these as ordinary environment variables rather than writing a .env, and
   * a build that silently baked in an empty API base produced a bundle whose every
   * request went to the web host instead of the API - a wall of 404s that looks like a
   * broken login rather than a misconfigured build. Reading both sources removes the
   * question of which one loadEnv happened to pick up.
   */
  const setting = (key: string) => env[key] ?? process.env[key] ?? "";

  return {
    plugins: [react()],

    // Accept both the legacy CRA prefix and Vite's own.
    envPrefix: ["VITE_", "REACT_APP_"],

    define: {
      "process.env.REACT_APP_API_BASE": JSON.stringify(setting("REACT_APP_API_BASE")),
      "process.env.NODE_ENV": JSON.stringify(mode),

      // Public demo credentials shown on the login page. Both must be set for the
      // panel to appear, so a deployment that does not want a demo simply omits them.
      // These are compiled into the bundle and are meant to be readable by anyone -
      // they only ever name the read-only HR account. See Pages/Login.
      "process.env.REACT_APP_DEMO_USER": JSON.stringify(setting("REACT_APP_DEMO_USER")),
      "process.env.REACT_APP_DEMO_PASS": JSON.stringify(setting("REACT_APP_DEMO_PASS")),
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

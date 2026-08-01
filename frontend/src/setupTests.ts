// Vitest setup. Runs before every test file.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// React Testing Library does not auto-clean under Vitest's globals.
afterEach(() => {
  cleanup();
  localStorage.clear();
});

// jsdom does not implement matchMedia, which the pre-paint theme script and some
// components rely on.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

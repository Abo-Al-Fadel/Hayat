import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, test, expect } from "vitest";
import App from "./App";

// App is a layout shell: it mounts the toast host and renders whatever the
// router resolves into its <Outlet />, so it needs a router context to render.
const renderAppWithChild = (child: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={child} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe("App shell", () => {
  test("renders the routed child through its outlet", () => {
    renderAppWithChild(<p>child page</p>);
    expect(screen.getByText("child page")).toBeInTheDocument();
  });

  test("mounts without crashing when the outlet is empty", () => {
    expect(() => renderAppWithChild(null)).not.toThrow();
  });
});

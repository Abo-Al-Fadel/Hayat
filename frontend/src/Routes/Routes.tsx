import React from "react";
import { createBrowserRouter } from "react-router-dom";
import App from "../App";
import Home from "../Pages/Home";
import Login from "../Pages/Login";
import Contact from "../Pages/Contact";
import AdminDashboard from "../Pages/AdminDashboard";
import PharmacistDashboard from "../Pages/PharmacistDashboard";
import StorageManagerDashboard from "../Pages/StorageManagerDashboard";
import NotFound from "../Pages/NotFound";
import HrHome from "../Pages/HrHome";
import ProtectedRoute from "./ProtectedRoute";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />, // App renders <Outlet /> for child pages
    children: [
      { path: "/", element: <Home /> },
      { path: "login", element: <Login /> },
      { path: "contact", element: <Contact /> },

      // HR view picker. HR has no dashboard of its own - it borrows the other three,
      // read-only - so it lands here and chooses which one to open.
      {
        path: "hr", // /hr
        element: (
          <ProtectedRoute allowedRoles={["HR"]}>
            <HrHome />
          </ProtectedRoute>
        ),
      },

      // Admin Dashboard
      {
        path: "admin", // /admin
        element: (
          // HR is the read-only observer: same pages as everyone else, no controls
          // that change anything. What actually stops it writing is server-side; see
          // Roles in the backend and RoleAuthorizationTests. Hiding a button is
          // courtesy, so listing HR here costs nothing in security terms.
          <ProtectedRoute allowedRoles={["Admin", "HR"]}>
            <AdminDashboard />
          </ProtectedRoute>
        ),
      },

      // Pharmacist / Cashier Dashboard
      {
        path: "pharmacist", // /pharmacist
        element: (
          <ProtectedRoute allowedRoles={["Pharmacist", "HR"]}>
            <PharmacistDashboard />
          </ProtectedRoute>
        ),
      },

      // Storage Manager Dashboard
      {
        path: "storage", // /storage
        element: (
          <ProtectedRoute allowedRoles={["StorageManager", "HR"]}>
            <StorageManagerDashboard />
          </ProtectedRoute>
        ),
      },

      // Catch-all: anything unmatched renders our own 404 rather than
      // react-router's built-in error screen.
      { path: "*", element: <NotFound /> },
    ],
  },
]);

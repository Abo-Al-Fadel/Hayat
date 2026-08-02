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
import ProtectedRoute from "./ProtectedRoute";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />, // App renders <Outlet /> for child pages
    children: [
      { path: "/", element: <Home /> },
      { path: "login", element: <Login /> },
      { path: "contact", element: <Contact /> },

      // Admin Dashboard
      {
        path: "admin", // /admin
        element: (
          // HR is the read-only observer: same pages as an Admin, no controls that
          // change anything. What actually stops it writing is server-side; see
          // Roles in the backend and RoleAuthorizationTests.
          <ProtectedRoute allowedRoles={["Admin", "HR"]}>
            <AdminDashboard />
          </ProtectedRoute>
        ),
      },

      // Pharmacist / Cashier Dashboard
      {
        path: "pharmacist", // /pharmacist
        element: (
          <ProtectedRoute allowedRoles={["Pharmacist"]}>
            <PharmacistDashboard />
          </ProtectedRoute>
        ),
      },

      // Storage Manager Dashboard
      {
        path: "storage", // /storage
        element: (
          <ProtectedRoute allowedRoles={["StorageManager"]}>
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

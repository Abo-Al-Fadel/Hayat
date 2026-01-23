import React from "react";
import { createBrowserRouter } from "react-router-dom";
import App from "../App";
import Home from "../Pages/Home";
import Login from "../Pages/Login";
import AdminDashboard from "../Pages/AdminDashboard";
import PharmacistDashboard from "../Pages/PharmacistDashboard";
import ProtectedRoute from "./ProtectedRoute";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />, // App renders <Outlet /> for child pages
    children: [
      { path: "/", element: <Home /> },
      { path: "login", element: <Login /> },

      // Admin Dashboard
      {
        path: "admin", // /admin
        element: (
          <ProtectedRoute allowedRoles={["Admin"]}>
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

      // Optional: Storage Manager Dashboard
      // {
      //   path: "storage",
      //   element: (
      //     <ProtectedRoute allowedRoles={["StorageManager"]}>
      //       <StorageManagerDashboard />
      //     </ProtectedRoute>
      //   ),
      // },
    ],
  },
]);

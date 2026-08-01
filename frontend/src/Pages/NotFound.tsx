import React from "react";
import { Link } from "react-router-dom";
import logo from "../Images/HL.png";

/**
 * Catch-all for unknown URLs. Without this, react-router fell through to its
 * built-in error screen, which leaks framework internals to end users.
 */
const NotFound: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
    <div className="text-center max-w-md">
      <img src={logo} alt="Hayat" className="h-16 w-16 object-contain mx-auto mb-6" />
      <h1 className="text-5xl font-bold text-gray-800 dark:text-gray-100 mb-2">404</h1>
      <p className="text-gray-600 dark:text-gray-300 mb-6">
        We couldn&apos;t find that page.
      </p>
      <Link
        to="/"
        className="inline-block bg-[#003465] hover:bg-[#00274d] text-white px-6 py-3 rounded-lg font-semibold transition-colors"
      >
        Back to home
      </Link>
    </div>
  </div>
);

export default NotFound;

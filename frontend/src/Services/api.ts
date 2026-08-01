// src/Services/api.ts
/**
 * AXIOS API CLIENT - SHARED SESSION
 *
 * RULES:
 * - Token from localStorage (shared across all tabs)
 * - Authorization header attached to all requests
 * - An expired token, or any 401 from the server, ends the session immediately
 */
import axios from "axios";
import { TOKEN_KEY, isTokenExpired } from "../utils/token";
import { handleSessionExpired, isHandlingSessionExpiry } from "./sessionExpiry";

const API_BASE = process.env.REACT_APP_API_BASE;

const api = axios.create({
  baseURL: API_BASE,
});

// Request interceptor - attach the token, but refuse to send an expired one.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);

  if (token && isTokenExpired(token)) {
    // Short-circuit here rather than letting the server reject it: this is what used
    // to leave dashboards mounted but permanently empty.
    handleSessionExpired();
    return Promise.reject(new axios.Cancel("Session expired"));
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Response interceptor - a 401 means the session is no longer usable.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    const status = error.response?.status;

    if (status === 401 && !isHandlingSessionExpiry()) {
      handleSessionExpired();
    }

    return Promise.reject(error);
  }
);

export default api;

// src/Services/api.ts
/**
 * AXIOS API CLIENT - SHARED SESSION
 * 
 * RULES:
 * - Token from localStorage (shared across all tabs)
 * - Authorization header attached to all requests
 */
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_BASE;

const api = axios.create({
  baseURL: API_BASE,
});

// Storage key - shared across all tabs
const TOKEN_KEY = "token";

// Request interceptor - attach token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Response interceptor - log errors, NO retries, NO redirects
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url;
    
    console.error(`[API] Request failed: ${status} - ${url}`);
    
    // NO automatic redirects
    // NO automatic retries
    // Let the calling code handle errors
    
    return Promise.reject(error);
  }
);

export default api;

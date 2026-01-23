// src/Services/AuthService.ts
/**
 * Auth Service - Handles login API calls
 * Backend returns: { token, user: { id, username, email, role } }
 * NO cookies, NO localStorage - sessionStorage handled by AuthContext
 */
import api from "./api";

export type LoginResponse = {
  token: string;
  user: {
    id: string;
    username: string;
    email?: string;
    role: string;
  };
};

export const loginAPI = async (username: string, password: string): Promise<LoginResponse> => {
  const response = await api.post("/api/Auth/login", {
    UserName: username,
    Password: password,
  });

  const data = response.data;
  
  console.log("[API] Login response received, token present:", !!data.token);

  // Backend returns: { token, user: { id, username, email, role } }
  return {
    token: data.token,
    user: {
      id: data.user?.id ?? "",
      username: data.user?.username ?? data.userName ?? "",
      email: data.user?.email ?? data.email ?? "",
      role: data.user?.role ?? data.role ?? "",
    },
  };
};

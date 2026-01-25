// src/Services/UserService.ts
import api from "./api";

export interface User {
  id: string;
  userName: string;
  email?: string;
  role: string;
}

export interface CreateUserDto {
  userName: string;
  password: string;
  email?: string;
  role: string;
}

export interface UpdateUserDto {
  userName: string;
  email: string;
}

// GET all users
export const getUsers = async (): Promise<User[]> => {
  const response = await api.get("/api/Users");
  return response.data;
};

// CREATE user
export const createUser = async (user: CreateUserDto): Promise<User> => {
  const response = await api.post("/api/Users/create", user);
  return response.data;
};

// UPDATE user profile (name and email)
export const updateUser = async (userId: string, data: UpdateUserDto): Promise<User> => {
  const response = await api.put(`/api/Users/${userId}`, data);
  return response.data;
};

// DELETE user
export const deleteUser = async (userId: string): Promise<void> => {
  await api.delete(`/api/Users/${userId}`);
};

/**
 * Update user role via PATCH request
 * Uses PATCH for partial update (role only)
 * 
 * @param userId - The user's ID
 * @param role - New role: "Admin" | "Pharmacist" | "StorageManager"
 * @returns Updated user object
 */
export const updateUserRole = async (userId: string, role: string): Promise<User> => {
  const response = await api.patch(`/api/Users/${userId}/role`, { role });
  return response.data;
};

import { create } from 'zustand';
import { apiClient } from '../api';
import { API_ENDPOINTS } from '../constants';
import type { Admin, LoginCredentials } from '@/types/api';

interface AuthState {
  admin: Admin | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  fetchAdminProfile: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  admin: null,
  isLoading: false,
  isAuthenticated: false,
  error: null,

  login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.post<{ admin: Admin; accessToken: string; refreshToken: string }>(
        API_ENDPOINTS.ADMIN_LOGIN,
        credentials
      );

      if (response.success && response.data) {
        const { admin, accessToken, refreshToken } = response.data;
        apiClient.setTokens(accessToken, refreshToken);
        set({
          admin,
          isAuthenticated: true,
          isLoading: false,
          error: null
        });
      } else {
        throw new Error(response.error || 'Login failed');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Login failed';
      set({
        error: errorMessage,
        isLoading: false,
        isAuthenticated: false
      });
      throw new Error(errorMessage);
    }
  },

  logout: async () => {
    try {
      const refreshToken = apiClient.getRefreshToken();
      if (refreshToken) {
        await apiClient.post(API_ENDPOINTS.LOGOUT, { refreshToken });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      apiClient.clearTokens();
      set({
        admin: null,
        isAuthenticated: false,
        error: null
      });
    }
  },

  fetchAdminProfile: async () => {
    const token = apiClient.getAccessToken();
    if (!token) {
      set({ isAuthenticated: false, admin: null });
      return;
    }

    set({ isLoading: true });
    try {
      const response = await apiClient.get<Admin>(API_ENDPOINTS.ADMIN_ME);
      if (response.success && response.data) {
        set({
          admin: response.data,
          isAuthenticated: true,
          isLoading: false
        });
      } else {
        apiClient.clearTokens();
        set({
          admin: null,
          isAuthenticated: false,
          isLoading: false
        });
      }
    } catch (error) {
      apiClient.clearTokens();
      set({
        admin: null,
        isAuthenticated: false,
        isLoading: false
      });
    }
  },

  clearError: () => set({ error: null }),
}));

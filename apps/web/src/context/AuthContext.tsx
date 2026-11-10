import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { authApi, ApiError } from "../services/api";
import type { AuthMeResponse, UserResponse, UserRoleResponse } from "@dpmg/shared";

interface AuthContextType {
  user: UserResponse | null;
  roles: UserRoleResponse[];
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthMeResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  hasScope: (scope: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [roles, setRoles] = useState<UserRoleResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  const refreshUser = useCallback(async () => {
    try {
      const response = await authApi.me();
      setUser(response.user);
      setRoles(response.roles);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setRoles([]);
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser().catch(() => {
      // les erreurs 401/500 sont déjà traduites dans l'état (user null, isLoading false)
    });
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await authApi.login({ email, password });
      setUser(response.user);
      setRoles(response.roles);
      return response;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setRoles([]);
    }
  };

  const hasRole = (role: string) => roles.some((r) => r.role === role);

  const hasAnyRole = (roleList: string[]) => roles.some((r) => roleList.includes(r.role));

  const hasScope = (scope: string) => roles.some((r) => r.scope === scope || r.scope === "*");

  return (
    <AuthContext.Provider
      value={{
        user,
        roles,
        isLoading,
        isAuthenticated,
        login,
        logout,
        refreshUser,
        hasRole,
        hasAnyRole,
        hasScope,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
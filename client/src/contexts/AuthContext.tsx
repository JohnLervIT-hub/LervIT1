import { createContext, useContext, useState, useEffect, useCallback } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  avatarUrl?: string | null;
  role: "customer" | "mover" | "admin";
  createdAt?: string | null;
  hasCompletedOnboarding?: boolean;
  hasUsedFirstMoveDiscount?: boolean;
  phoneVerified?: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, role?: string, phone?: string, phoneVerificationToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser({
          id: userData.id,
          email: userData.email,
          name: userData.name,
          phone: userData.phone,
          address: userData.address,
          avatarUrl: userData.avatarUrl,
          role: userData.role || "customer",
          createdAt: userData.createdAt,
          hasCompletedOnboarding: userData.hasCompletedOnboarding ?? false,
          hasUsedFirstMoveDiscount: userData.hasUsedFirstMoveDiscount ?? false,
          phoneVerified: userData.phoneVerified ?? false,
        });
      } else {
        setUser(null);
      }
    } catch (error) {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      await refreshUser();
      setIsLoading(false);
    };
    initAuth();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      // Create error with detailed message for lockout scenarios
      const errorMessage = errorData.message || errorData.error || "Login failed";
      const error = new Error(errorMessage) as Error & { 
        locked?: boolean; 
        lockedByAdmin?: boolean;
        remainingMinutes?: number;
        remainingAttempts?: number;
      };
      // Attach lockout metadata to error
      if (errorData.locked) {
        (error as any).locked = true;
        (error as any).lockedByAdmin = errorData.lockedByAdmin;
        (error as any).remainingMinutes = errorData.remainingMinutes;
      }
      if (errorData.remainingAttempts !== undefined) {
        (error as any).remainingAttempts = errorData.remainingAttempts;
      }
      throw error;
    }
    
    const userData = await response.json();
    
    // Longer delay for mobile browsers (especially iOS Safari) to properly set cookies
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Verify the session is actually working by making a test request
    try {
      const verifyResponse = await fetch("/api/auth/me", {
        credentials: "include",
      });
      if (!verifyResponse.ok) {
        console.warn("Session verification failed after login, retrying...");
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (e) {
      console.warn("Session verification error:", e);
    }
    
    setUser({
      id: userData.id,
      email: userData.email,
      name: userData.name,
      phone: userData.phone,
      address: userData.address,
      avatarUrl: userData.avatarUrl,
      role: userData.role || "customer",
      createdAt: userData.createdAt,
      hasCompletedOnboarding: userData.hasCompletedOnboarding ?? false,
      hasUsedFirstMoveDiscount: userData.hasUsedFirstMoveDiscount ?? false,
      phoneVerified: userData.phoneVerified ?? false,
    });
  };

  const signup = async (name: string, email: string, password: string, role: string = "customer", phone?: string, phoneVerificationToken?: string) => {
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, email, password, role, phone, phoneVerificationToken }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Signup failed");
    }
    
    const userData = await response.json();
    
    // Longer delay for mobile browsers (especially iOS Safari) to properly set cookies
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Verify the session is actually working by making a test request
    // This helps catch cookie issues early
    try {
      const verifyResponse = await fetch("/api/auth/me", {
        credentials: "include",
      });
      if (!verifyResponse.ok) {
        console.warn("Session verification failed after signup, retrying...");
        // If verification fails, wait longer and try one more time
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (e) {
      console.warn("Session verification error:", e);
    }
    
    setUser({
      id: userData.id,
      email: userData.email,
      name: userData.name,
      phone: userData.phone,
      address: userData.address,
      avatarUrl: userData.avatarUrl,
      role: userData.role || "customer",
      createdAt: userData.createdAt,
      hasCompletedOnboarding: userData.hasCompletedOnboarding ?? false,
      hasUsedFirstMoveDiscount: userData.hasUsedFirstMoveDiscount ?? false,
      phoneVerified: userData.phoneVerified ?? false,
    });
  };

  const logout = async () => {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      
      // Wait for the response to complete before clearing user state
      if (response.ok) {
        console.log("Logout successful");
        // Only clear user state after server confirms successful logout
        setUser(null);
      } else {
        console.error("Logout failed with status:", response.status);
        // Still clear on failure to prevent stuck state, but log the issue
        setUser(null);
      }
    } catch (error) {
      console.error("Logout error:", error);
      // Clear on network error to prevent stuck state
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, isLoading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

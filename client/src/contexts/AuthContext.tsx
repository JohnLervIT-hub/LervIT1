import { createContext, useContext, useState, useEffect } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  role: "customer" | "mover" | "admin";
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, role?: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem("moveit_user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Login failed");
      }
      
      const userData = await response.json();
      
      const userAuth: User = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role || "customer",
      };
      
      setUser(userAuth);
      localStorage.setItem("moveit_user", JSON.stringify(userAuth));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Login failed. Please check your credentials.");
    }
  };

  const signup = async (name: string, email: string, password: string, role: string = "customer") => {
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Signup failed");
      }
      
      const userData = await response.json();
      
      const userAuth: User = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role || "customer",
      };
      
      setUser(userAuth);
      localStorage.setItem("moveit_user", JSON.stringify(userAuth));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Signup failed. Please try again.");
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("moveit_user");
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, isLoading }}>
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

import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useJsApiLoader } from "@react-google-maps/api";
import Header from "@/components/Header";
import SplashScreen from "@/components/SplashScreen";
import Home from "@/pages/Home";
import BrowseMovers from "@/pages/BrowseMovers";
import RequestMove from "@/pages/RequestMove";
import CustomerDashboard from "@/pages/CustomerDashboard";
import MyBookings from "@/pages/MyBookings";
import MoverDashboard from "@/pages/MoverDashboard";
import MoverProfileSetup from "@/pages/MoverProfileSetup";
import Messages from "@/pages/Messages";
import Review from "@/pages/Review";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminUsersPage from "@/pages/AdminUsersPage";
import AdminMoversPage from "@/pages/AdminMoversPage";
import AdminMovesPage from "@/pages/AdminMovesPage";
import AdminRevenuePage from "@/pages/AdminRevenuePage";
import ProximityDemo from "@/pages/ProximityDemo";
import LifecycleDemo from "@/pages/LifecycleDemo";
import MoverLifecycleDemo from "@/pages/MoverLifecycleDemo";
import VideoPreview from "@/pages/VideoPreview";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Support from "@/pages/Support";
import AdminSupportDashboard from "@/pages/AdminSupportDashboard";
import AdminVerificationDashboard from "@/pages/AdminVerificationDashboard";
import Payment from "@/pages/Payment";
import TrackTrip from "@/pages/TrackTrip";
import LandingPage from "@/pages/LandingPage";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/" component={Home} />
      <Route path="/website" component={LandingPage} />
      <Route path="/demo" component={ProximityDemo} />
      <Route path="/lifecycle" component={LifecycleDemo} />
      <Route path="/mover-lifecycle" component={MoverLifecycleDemo} />
      <Route path="/video-preview" component={VideoPreview} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/browse-movers" component={BrowseMovers} />
      <Route path="/support" component={Support} />
      <Route path="/request-move" component={RequestMove} />

      {/* Customer-Only Routes */}
      <Route path="/dashboard">
        <ProtectedRoute allowedRoles={["customer"]}>
          <CustomerDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/my-bookings">
        <ProtectedRoute allowedRoles={["customer"]}>
          <MyBookings />
        </ProtectedRoute>
      </Route>
      <Route path="/payment/:bookingId">
        <ProtectedRoute allowedRoles={["customer"]}>
          <Payment />
        </ProtectedRoute>
      </Route>
      <Route path="/track-trip/:bookingId">
        <ProtectedRoute allowedRoles={["customer"]}>
          <TrackTrip />
        </ProtectedRoute>
      </Route>

      {/* Mover-Only Routes */}
      <Route path="/mover-dashboard">
        <ProtectedRoute allowedRoles={["mover"]}>
          <MoverDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/mover-profile">
        <ProtectedRoute allowedRoles={["mover"]}>
          <MoverProfileSetup />
        </ProtectedRoute>
      </Route>

      {/* Admin-Only Routes */}
      <Route path="/admin">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/support">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminSupportDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/verification">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminVerificationDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminUsersPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/movers">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminMoversPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/moves">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminMovesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/revenue">
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminRevenuePage />
        </ProtectedRoute>
      </Route>

      {/* Shared Routes (Customer & Mover) */}
      <Route path="/messages/:bookingId">
        <ProtectedRoute allowedRoles={["customer", "mover"]}>
          <Messages />
        </ProtectedRoute>
      </Route>
      <Route path="/review/:bookingId">
        <ProtectedRoute allowedRoles={["customer", "mover"]}>
          <Review />
        </ProtectedRoute>
      </Route>

      {/* 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

// CRITICAL: Libraries array MUST be defined outside component to prevent reloads
const GOOGLE_MAPS_LIBRARIES: ("places" | "drawing" | "geometry" | "visualization")[] = ["places"];

function App() {
  const [showSplash, setShowSplash] = useState(true);
  
  // Load Google Maps JavaScript API with Places library
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  // Show splash screen while loading
  if (showSplash) {
    return (
      <SplashScreen 
        onComplete={() => setShowSplash(false)} 
        minDisplayTime={2500}
      />
    );
  }

  if (loadError) {
    console.error("Google Maps API Error:", loadError);
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-lg text-destructive">Failed to load Google Maps</div>
          <div className="text-sm text-muted-foreground mt-2">Please check your API key configuration</div>
        </div>
      </div>
    );
  }

  // Wait for Google Maps to load before rendering
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-lg text-muted-foreground">Loading maps...</div>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Header />
          <Router />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

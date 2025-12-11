import { useState, Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PageTransition } from "@/components/PageTransition";
import { ScrollToTop } from "@/components/ScrollToTop";
import { useJsApiLoader } from "@react-google-maps/api";
import Header from "@/components/Header";
import SplashScreen from "@/components/SplashScreen";
import { Loader2 } from "lucide-react";

// Lazy load all pages for code splitting
const Home = lazy(() => import("@/pages/Home"));
const BrowseMovers = lazy(() => import("@/pages/BrowseMovers"));
const RequestMove = lazy(() => import("@/pages/RequestMove"));
const CustomerDashboard = lazy(() => import("@/pages/CustomerDashboard"));
const MyBookings = lazy(() => import("@/pages/MyBookings"));
const MoverDashboard = lazy(() => import("@/pages/MoverDashboard"));
const MoverProfileSetup = lazy(() => import("@/pages/MoverProfileSetup"));
const Messages = lazy(() => import("@/pages/Messages"));
const Review = lazy(() => import("@/pages/Review"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AdminUsersPage = lazy(() => import("@/pages/AdminUsersPage"));
const AdminMoversPage = lazy(() => import("@/pages/AdminMoversPage"));
const AdminMovesPage = lazy(() => import("@/pages/AdminMovesPage"));
const AdminRevenuePage = lazy(() => import("@/pages/AdminRevenuePage"));
const ProximityDemo = lazy(() => import("@/pages/ProximityDemo"));
const LifecycleDemo = lazy(() => import("@/pages/LifecycleDemo"));
const MoverLifecycleDemo = lazy(() => import("@/pages/MoverLifecycleDemo"));
const VideoPreview = lazy(() => import("@/pages/VideoPreview"));
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Support = lazy(() => import("@/pages/Support"));
const AdminSupportDashboard = lazy(() => import("@/pages/AdminSupportDashboard"));
const AdminVerificationDashboard = lazy(() => import("@/pages/AdminVerificationDashboard"));
const Payment = lazy(() => import("@/pages/Payment"));
const TrackTrip = lazy(() => import("@/pages/TrackTrip"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const CustomerProfile = lazy(() => import("@/pages/CustomerProfile"));
const MoverProfile = lazy(() => import("@/pages/MoverProfile"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Page loading spinner
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
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
        <Route path="/profile">
          <ProtectedRoute allowedRoles={["customer"]}>
            <CustomerProfile />
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
        <Route path="/mover-settings">
          <ProtectedRoute allowedRoles={["mover"]}>
            <MoverProfile />
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
    </Suspense>
  );
}

// CRITICAL: Libraries array MUST be defined outside component to prevent reloads
const GOOGLE_MAPS_LIBRARIES: ("places" | "drawing" | "geometry" | "visualization")[] = ["places", "geometry"];

function App() {
  const [showSplash, setShowSplash] = useState(true);
  
  // Load Google Maps JavaScript API with Places library
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  // Show splash screen while loading (reduced time for faster perceived load)
  if (showSplash) {
    return (
      <SplashScreen 
        onComplete={() => setShowSplash(false)} 
        minDisplayTime={1500}
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
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <ErrorBoundary>
              <ScrollToTop />
              <Header />
              <div className="pb-16 md:pb-0">
                <PageTransition>
                  <Router />
                </PageTransition>
              </div>
              <MobileBottomNav />
            </ErrorBoundary>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;

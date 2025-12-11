import { useState, lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { GoogleMapsProvider } from "@/contexts/GoogleMapsContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PageTransition } from "@/components/PageTransition";
import { ScrollToTop } from "@/components/ScrollToTop";
import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";
import Header from "@/components/Header";

// ============================================================================
// PERFORMANCE OPTIMIZATION: Route-level code splitting with React.lazy
// All page components are lazy-loaded to reduce initial bundle size
// Heavy pages (maps, admin, dashboards) are only fetched when needed
// ============================================================================

// Public pages - loaded on demand
const Home = lazy(() => import("@/pages/Home"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Support = lazy(() => import("@/pages/Support"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Heavy pages - maps, complex forms (lazy loaded to avoid blocking FCP)
const BrowseMovers = lazy(() => import("@/pages/BrowseMovers"));
const RequestMove = lazy(() => import("@/pages/RequestMove"));

// Customer pages - only loaded when customer navigates there
const CustomerDashboard = lazy(() => import("@/pages/CustomerDashboard"));
const MyBookings = lazy(() => import("@/pages/MyBookings"));
const Payment = lazy(() => import("@/pages/Payment"));
const TrackTrip = lazy(() => import("@/pages/TrackTrip"));
const CustomerProfile = lazy(() => import("@/pages/CustomerProfile"));

// Mover pages - only loaded for mover users
const MoverDashboard = lazy(() => import("@/pages/MoverDashboard"));
const MoverProfileSetup = lazy(() => import("@/pages/MoverProfileSetup"));
const MoverProfile = lazy(() => import("@/pages/MoverProfile"));

// Admin pages - heavy dashboards, only loaded for admins
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AdminUsersPage = lazy(() => import("@/pages/AdminUsersPage"));
const AdminMoversPage = lazy(() => import("@/pages/AdminMoversPage"));
const AdminMovesPage = lazy(() => import("@/pages/AdminMovesPage"));
const AdminRevenuePage = lazy(() => import("@/pages/AdminRevenuePage"));
const AdminSupportDashboard = lazy(() => import("@/pages/AdminSupportDashboard"));
const AdminVerificationDashboard = lazy(() => import("@/pages/AdminVerificationDashboard"));

// Shared pages
const Messages = lazy(() => import("@/pages/Messages"));
const Review = lazy(() => import("@/pages/Review"));


function Router() {
  return (
    <Suspense fallback={<PageLoadingSkeleton />}>
      <Switch>
        {/* Public Routes */}
        <Route path="/" component={Home} />
        <Route path="/website" component={LandingPage} />
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

// ============================================================================
// PERFORMANCE: Google Maps loaded lazily inside components that need it
// App shell renders immediately without waiting for external API
// ============================================================================

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <GoogleMapsProvider>
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
          </GoogleMapsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;

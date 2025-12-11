import { Suspense, lazy, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient, prefetchCriticalData } from "./lib/queryClient";
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
import Header from "@/components/Header";
import { PageSkeleton, HeroSkeleton, DashboardSkeleton } from "@/components/PageSkeleton";

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

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Suspense fallback={<HeroSkeleton />}>
          <Home />
        </Suspense>
      </Route>
      <Route path="/website">
        <Suspense fallback={<HeroSkeleton />}>
          <LandingPage />
        </Suspense>
      </Route>
      <Route path="/demo">
        <Suspense fallback={<PageSkeleton />}>
          <ProximityDemo />
        </Suspense>
      </Route>
      <Route path="/lifecycle">
        <Suspense fallback={<PageSkeleton />}>
          <LifecycleDemo />
        </Suspense>
      </Route>
      <Route path="/mover-lifecycle">
        <Suspense fallback={<PageSkeleton />}>
          <MoverLifecycleDemo />
        </Suspense>
      </Route>
      <Route path="/video-preview">
        <Suspense fallback={<PageSkeleton />}>
          <VideoPreview />
        </Suspense>
      </Route>
      <Route path="/login">
        <Suspense fallback={<PageSkeleton />}>
          <Login />
        </Suspense>
      </Route>
      <Route path="/signup">
        <Suspense fallback={<PageSkeleton />}>
          <Signup />
        </Suspense>
      </Route>
      <Route path="/forgot-password">
        <Suspense fallback={<PageSkeleton />}>
          <ForgotPassword />
        </Suspense>
      </Route>
      <Route path="/reset-password">
        <Suspense fallback={<PageSkeleton />}>
          <ResetPassword />
        </Suspense>
      </Route>
      <Route path="/browse-movers">
        <Suspense fallback={<PageSkeleton />}>
          <BrowseMovers />
        </Suspense>
      </Route>
      <Route path="/support">
        <Suspense fallback={<PageSkeleton />}>
          <Support />
        </Suspense>
      </Route>
      <Route path="/request-move">
        <Suspense fallback={<PageSkeleton />}>
          <RequestMove />
        </Suspense>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute allowedRoles={["customer"]}>
          <Suspense fallback={<DashboardSkeleton />}>
            <CustomerDashboard />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/my-bookings">
        <ProtectedRoute allowedRoles={["customer"]}>
          <Suspense fallback={<DashboardSkeleton />}>
            <MyBookings />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/payment/:bookingId">
        <ProtectedRoute allowedRoles={["customer"]}>
          <Suspense fallback={<PageSkeleton />}>
            <Payment />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/track-trip/:bookingId">
        <ProtectedRoute allowedRoles={["customer"]}>
          <Suspense fallback={<PageSkeleton />}>
            <TrackTrip />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/profile">
        <ProtectedRoute allowedRoles={["customer"]}>
          <Suspense fallback={<PageSkeleton />}>
            <CustomerProfile />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/mover-dashboard">
        <ProtectedRoute allowedRoles={["mover"]}>
          <Suspense fallback={<DashboardSkeleton />}>
            <MoverDashboard />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/mover-profile">
        <ProtectedRoute allowedRoles={["mover"]}>
          <Suspense fallback={<PageSkeleton />}>
            <MoverProfileSetup />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/mover-settings">
        <ProtectedRoute allowedRoles={["mover"]}>
          <Suspense fallback={<PageSkeleton />}>
            <MoverProfile />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute allowedRoles={["admin"]}>
          <Suspense fallback={<DashboardSkeleton />}>
            <AdminDashboard />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/support">
        <ProtectedRoute allowedRoles={["admin"]}>
          <Suspense fallback={<DashboardSkeleton />}>
            <AdminSupportDashboard />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/verification">
        <ProtectedRoute allowedRoles={["admin"]}>
          <Suspense fallback={<DashboardSkeleton />}>
            <AdminVerificationDashboard />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute allowedRoles={["admin"]}>
          <Suspense fallback={<DashboardSkeleton />}>
            <AdminUsersPage />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/movers">
        <ProtectedRoute allowedRoles={["admin"]}>
          <Suspense fallback={<DashboardSkeleton />}>
            <AdminMoversPage />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/moves">
        <ProtectedRoute allowedRoles={["admin"]}>
          <Suspense fallback={<DashboardSkeleton />}>
            <AdminMovesPage />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/revenue">
        <ProtectedRoute allowedRoles={["admin"]}>
          <Suspense fallback={<DashboardSkeleton />}>
            <AdminRevenuePage />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/messages/:bookingId">
        <ProtectedRoute allowedRoles={["customer", "mover"]}>
          <Suspense fallback={<PageSkeleton />}>
            <Messages />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/review/:bookingId">
        <ProtectedRoute allowedRoles={["customer", "mover"]}>
          <Suspense fallback={<PageSkeleton />}>
            <Review />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route>
        <Suspense fallback={<PageSkeleton />}>
          <NotFound />
        </Suspense>
      </Route>
    </Switch>
  );
}

function App() {
  useEffect(() => {
    prefetchCriticalData();
  }, []);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <GoogleMapsProvider>
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
        </GoogleMapsProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;

import { useState, useEffect, lazy, Suspense, type ReactNode } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { GoogleMapsProvider } from "@/contexts/GoogleMapsContext";
import { LocationProvider } from "@/contexts/LocationContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PageTransition } from "@/components/PageTransition";
import { ScrollToTop } from "@/components/ScrollToTop";
import { PageLoader } from "@/components/PageLoader";
import { InstallPrompt } from "@/components/InstallPrompt";
import Header from "@/components/Header";

// Import directly to avoid HMR timing issues
import { JobNotificationSound } from "@/components/JobNotificationSound";
// Lazy load splash screen
const SplashScreen = lazy(() => import("@/components/SplashScreen"));

// Eagerly load critical public pages
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import NotFound from "@/pages/not-found";

// Lazy load heavy pages for better initial load
const BrowseMovers = lazy(() => import("@/pages/BrowseMovers"));
const RequestMove = lazy(() => import("@/pages/RequestMove"));
const CustomerDashboard = lazy(() => import("@/pages/CustomerDashboard"));
const MyBookings = lazy(() => import("@/pages/MyBookings"));
const MoverDashboard = lazy(() => import("@/pages/MoverDashboard"));
const MoverProfileSetup = lazy(() => import("@/pages/MoverProfileSetup"));
const MoverOnboardingWizard = lazy(
  () => import("@/pages/MoverOnboardingWizard"),
);
const Messages = lazy(() => import("@/pages/Messages"));
const Review = lazy(() => import("@/pages/Review"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AdminUsersPage = lazy(() => import("@/pages/AdminUsersPage"));
const AdminMoversPage = lazy(() => import("@/pages/AdminMoversPage"));
const AdminMovesPage = lazy(() => import("@/pages/AdminMovesPage"));
const AdminRevenuePage = lazy(() => import("@/pages/AdminRevenuePage"));
const AdminPayoutsPage = lazy(() => import("@/pages/AdminPayoutsPage"));
// Demo pages removed for production - archived in client/src/pages/archived/
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const Support = lazy(() => import("@/pages/Support"));
const AdminSupportDashboard = lazy(
  () => import("@/pages/AdminSupportDashboard"),
);
const AdminVerificationDashboard = lazy(
  () => import("@/pages/AdminVerificationDashboard"),
);
const AdminEmailCenter = lazy(() => import("@/pages/AdminEmailCenter"));
const Payment = lazy(() => import("@/pages/Payment"));
const TrackTrip = lazy(() => import("@/pages/TrackTrip"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const CustomerProfile = lazy(() => import("@/pages/CustomerProfile"));
const MoverProfile = lazy(() => import("@/pages/MoverProfile"));
const MoverVerification = lazy(() => import("@/pages/MoverVerification"));
const Inbox = lazy(() => import("@/pages/Inbox"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const MoverAgreement = lazy(() => import("@/pages/MoverAgreement"));

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* Public Routes - Critical pages load eagerly */}
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />

        {/* Public Routes - Lazy loaded */}
        <Route path="/website" component={LandingPage} />
        <Route path="/terms" component={TermsOfService} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/mover-agreement" component={MoverAgreement} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/verify-email" component={VerifyEmail} />
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

        {/* Shared Authenticated Routes */}
        <Route path="/inbox">
          <ProtectedRoute allowedRoles={["customer", "mover", "admin"]}>
            <Inbox />
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
        <Route path="/mover-verification">
          <ProtectedRoute allowedRoles={["mover"]}>
            <MoverVerification />
          </ProtectedRoute>
        </Route>
        <Route path="/mover-onboarding">
          <ProtectedRoute allowedRoles={["mover"]}>
            <MoverOnboardingWizard />
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
        <Route path="/admin/payouts">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminPayoutsPage />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/email-center">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminEmailCenter />
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

function AppContent({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const { user } = useAuth();
  const showPromoBanner = !user && loc === "/";
  return (
    <main
      className="pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0"
      style={{
        paddingTop: showPromoBanner
          ? "calc(100px + env(safe-area-inset-top))"
          : "calc(64px + env(safe-area-inset-top))",
      }}
    >
      {children}
    </main>
  );
}

function App() {
  // Skip splash for returning users (visited within last 24 hours)
  const hasVisitedRecently = () => {
    try {
      const lastVisit = sessionStorage.getItem("lervit_last_visit");
      if (lastVisit) {
        const elapsed = Date.now() - parseInt(lastVisit, 10);
        return elapsed < 24 * 60 * 60 * 1000; // 24 hours
      }
    } catch {
      return false;
    }
    return false;
  };

  const [showSplash, setShowSplash] = useState(!hasVisitedRecently());

  // Mark visit for future splash skip
  useEffect(() => {
    try {
      sessionStorage.setItem("lervit_last_visit", Date.now().toString());
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Show splash screen for first-time visitors (reduced to 800ms)
  if (showSplash) {
    return (
      <Suspense fallback={<PageLoader />}>
        <SplashScreen
          onComplete={() => setShowSplash(false)}
          minDisplayTime={800}
        />
      </Suspense>
    );
  }

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <GoogleMapsProvider>
            <LocationProvider>
              <TooltipProvider>
                <ErrorBoundary>
                  <ScrollToTop />
                  <Header />
                  <AppContent>
                    <PageTransition>
                      <Router />
                    </PageTransition>
                  </AppContent>
                  <MobileBottomNav />
                  <JobNotificationSound />
                  <InstallPrompt />
                </ErrorBoundary>
                <Toaster />
              </TooltipProvider>
            </LocationProvider>
          </GoogleMapsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;

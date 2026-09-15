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
import { VoiceProvider } from "@/contexts/VoiceContext";
import AdminVoiceWidget from "@/components/AdminVoiceWidget";

// Import directly to avoid HMR timing issues
import { JobNotificationSound } from "@/components/JobNotificationSound";
import { MoverGpsHeartbeat } from "@/components/MoverGpsHeartbeat";
// Lazy load splash screen
const SplashScreen = lazy(() => import("@/components/SplashScreen"));

// Partner portal pages (lazy loaded, own layout)
const PartnerActivate = lazy(() => import("@/pages/partner/PartnerActivate"));
const PartnerDashboard = lazy(() => import("@/pages/partner/PartnerDashboard"));
const PartnerOnboarding = lazy(() => import("@/pages/partner/PartnerOnboarding"));
const PartnerBookings = lazy(() => import("@/pages/partner/PartnerBookings"));
const PartnerBookingDetail = lazy(() => import("@/pages/partner/PartnerBookingDetail"));
const PartnerCompliance = lazy(() => import("@/pages/partner/PartnerCompliance"));
const PartnerIncidents = lazy(() => import("@/pages/partner/PartnerIncidents"));
const PartnerTeam = lazy(() => import("@/pages/partner/PartnerTeam"));
const PartnerAudit = lazy(() => import("@/pages/partner/PartnerAudit"));
const PartnerEarnings = lazy(() => import("@/pages/partner/PartnerEarnings"));
const PartnerUsers = lazy(() => import("@/pages/partner/PartnerUsers"));
const PartnerMessages = lazy(() => import("@/pages/partner/PartnerMessages"));
const PartnerLegal = lazy(() => import("@/pages/partner/PartnerLegal"));

// Eagerly load critical public pages
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import NotFound from "@/pages/not-found";

// Lazy load heavy pages for better initial load
const BrowseMovers = lazy(() => import("@/pages/BrowseMovers"));
const RequestMove = lazy(() => import("@/pages/RequestMove"));
const QuotePage = lazy(() => import("@/pages/QuotePage"));
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
const AdminLeadsPage = lazy(() => import("@/pages/AdminLeadsPage"));
const AdminMovesPage = lazy(() => import("@/pages/AdminMovesPage"));
const AdminRevenuePage = lazy(() => import("@/pages/AdminRevenuePage"));
const AdminPayoutsPage = lazy(() => import("@/pages/AdminPayoutsPage"));
const AdminPartnersPage = lazy(() => import("@/pages/AdminPartnersPage"));
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
const AdminAuditDetailPage = lazy(
  () => import("@/pages/AdminAuditDetailPage"),
);
const AdminEmailCenter = lazy(() => import("@/pages/AdminEmailCenter"));
const AdminCampaignsPage = lazy(() => import("@/pages/AdminCampaignsPage"));
const AdminVoicePage = lazy(() => import("@/pages/AdminVoicePage"));
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
const Downloads = lazy(() => import("@/pages/Downloads"));

const ENTERPRISE_ENABLED = import.meta.env.VITE_ENABLE_ENTERPRISE === "true";

const PARTNER_ROLES = ["partner_admin", "partner_dispatcher", "partner_ops_manager", "partner_viewer"] as const;

function PartnerRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/partner-activate" component={PartnerActivate} />
        <Route path="/partner/activate" component={PartnerActivate} />
        <Route path="/partner/dashboard">
          <ProtectedRoute allowedRoles={[...PARTNER_ROLES]}>
            <PartnerDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/partner/onboarding">
          <ProtectedRoute allowedRoles={[...PARTNER_ROLES]}>
            <PartnerOnboarding />
          </ProtectedRoute>
        </Route>
        <Route path="/partner/bookings/:id">
          <ProtectedRoute allowedRoles={[...PARTNER_ROLES]}>
            <PartnerBookingDetail />
          </ProtectedRoute>
        </Route>
        <Route path="/partner/bookings">
          <ProtectedRoute allowedRoles={[...PARTNER_ROLES]}>
            <PartnerBookings />
          </ProtectedRoute>
        </Route>
        <Route path="/partner/compliance">
          <ProtectedRoute allowedRoles={[...PARTNER_ROLES]}>
            <PartnerCompliance />
          </ProtectedRoute>
        </Route>
        <Route path="/partner/incidents">
          <ProtectedRoute allowedRoles={[...PARTNER_ROLES]}>
            <PartnerIncidents />
          </ProtectedRoute>
        </Route>
        <Route path="/partner/team">
          <ProtectedRoute allowedRoles={[...PARTNER_ROLES]}>
            <PartnerTeam />
          </ProtectedRoute>
        </Route>
        <Route path="/partner/messages">
          <ProtectedRoute allowedRoles={[...PARTNER_ROLES]}>
            <PartnerMessages />
          </ProtectedRoute>
        </Route>
        <Route path="/partner/users">
          <ProtectedRoute allowedRoles={["partner_admin"]}>
            <PartnerUsers />
          </ProtectedRoute>
        </Route>
        <Route path="/partner/audit">
          <ProtectedRoute allowedRoles={[...PARTNER_ROLES]}>
            <PartnerAudit />
          </ProtectedRoute>
        </Route>
        <Route path="/partner/earnings">
          <ProtectedRoute allowedRoles={[...PARTNER_ROLES]}>
            <PartnerEarnings />
          </ProtectedRoute>
        </Route>
        <Route path="/partner/legal">
          <ProtectedRoute allowedRoles={[...PARTNER_ROLES]}>
            <PartnerLegal />
          </ProtectedRoute>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

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
        <Route path="/downloads" component={Downloads} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/browse-movers" component={BrowseMovers} />
        <Route path="/support" component={Support} />
        <Route path="/request-move" component={RequestMove} />
        <Route path="/quote/:id" component={QuotePage} />

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
        <Route path="/admin/audits/:auditId">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminAuditDetailPage />
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
        <Route path="/admin/leads">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminLeadsPage />
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
        <Route path="/admin/campaigns/:id">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminCampaignsPage />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/campaigns">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminCampaignsPage />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/voice">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminVoicePage />
          </ProtectedRoute>
        </Route>
        {ENTERPRISE_ENABLED && (
          <>
            <Route path="/admin/partners/:id">
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminPartnersPage />
              </ProtectedRoute>
            </Route>
            <Route path="/admin/partners">
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminPartnersPage />
              </ProtectedRoute>
            </Route>
          </>
        )}

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
      className={`${showPromoBanner ? "pt-[100px]" : "pt-16"} pb-16 md:pb-0`}
    >
      {children}
    </main>
  );
}

function AppShell() {
  const [loc, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const isPartnerRoute = ENTERPRISE_ENABLED &&
    (loc.startsWith("/partner") || loc === "/partner-activate");

  // Redirect partner users away from consumer routes
  useEffect(() => {
    if (ENTERPRISE_ENABLED && !isLoading && user?.role?.startsWith("partner_") && !isPartnerRoute) {
      setLocation("/partner/dashboard");
    }
  }, [user, isLoading, isPartnerRoute, setLocation]);

  if (isPartnerRoute) {
    return (
      <ErrorBoundary>
        <ScrollToTop />
        <PartnerRouter />
      </ErrorBoundary>
    );
  }

  // While a partner user's session is resolving, show nothing (they'll be redirected)
  if (ENTERPRISE_ENABLED && !isLoading && user?.role?.startsWith("partner_")) {
    return null;
  }

  return (
    <ErrorBoundary>
      <ScrollToTop />
      <VoiceProvider>
        <Header />
        <AppContent>
          <PageTransition>
            <Router />
          </PageTransition>
        </AppContent>
        <MobileBottomNav />
        <JobNotificationSound />
        <MoverGpsHeartbeat />
        <InstallPrompt />
        {user?.role === "admin" && <AdminVoiceWidget />}
      </VoiceProvider>
    </ErrorBoundary>
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
                <AppShell />
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

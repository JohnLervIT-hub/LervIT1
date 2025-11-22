import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Header from "@/components/Header";
import Home from "@/pages/Home";
import BrowseMovers from "@/pages/BrowseMovers";
import RequestMove from "@/pages/RequestMove";
import CustomerDashboard from "@/pages/CustomerDashboard";
import MyBookings from "@/pages/MyBookings";
import MoverDashboard from "@/pages/MoverDashboard";
import Messages from "@/pages/Messages";
import Review from "@/pages/Review";
import AdminDashboard from "@/pages/AdminDashboard";
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
import Payment from "@/pages/Payment";
import TrackTrip from "@/pages/TrackTrip";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/" component={Home} />
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

      {/* Customer-Only Routes */}
      <Route path="/request-move">
        <ProtectedRoute allowedRoles={["customer"]}>
          <RequestMove />
        </ProtectedRoute>
      </Route>
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

function App() {
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

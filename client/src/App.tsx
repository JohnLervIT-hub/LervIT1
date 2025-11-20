import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
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
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/browse-movers" component={BrowseMovers} />
      <Route path="/request-move" component={RequestMove} />
      <Route path="/dashboard" component={CustomerDashboard} />
      <Route path="/my-bookings" component={MyBookings} />
      <Route path="/mover-dashboard" component={MoverDashboard} />
      <Route path="/messages/:bookingId" component={Messages} />
      <Route path="/review/:bookingId" component={Review} />
      <Route path="/admin" component={AdminDashboard} />
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

import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Header from "@/components/Header";
import Home from "@/pages/Home";
import BrowseMovers from "@/pages/BrowseMovers";
import RequestMove from "@/pages/RequestMove";
import CustomerDashboard from "@/pages/CustomerDashboard";
import Messages from "@/pages/Messages";
import AdminDashboard from "@/pages/AdminDashboard";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/browse-movers" component={BrowseMovers} />
      <Route path="/request-move" component={RequestMove} />
      <Route path="/dashboard" component={CustomerDashboard} />
      <Route path="/messages" component={Messages} />
      <Route path="/admin" component={AdminDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Header />
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

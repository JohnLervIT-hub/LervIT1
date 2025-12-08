import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  ArrowUpRight,
  Building,
  CreditCard,
  History,
} from "lucide-react";
import { format } from "date-fns";

interface PayoutSummary {
  profileMissing?: boolean;
  pendingEarnings: string;
  availableBalance: string;
  totalPaidOut: string;
  totalEarnings: string;
  completedJobs: number;
  platformFeePercent: number;
  payoutAccount: {
    hasAccount: boolean;
    payoutsEnabled?: boolean;
    onboardingStatus?: string;
  };
  recentPayouts: Array<{
    id: string;
    amount: string;
    status: string;
    payoutType: string;
    arrivalDate?: string;
    initiatedAt: string;
  }>;
}

interface EarningsResponse {
  profileMissing?: boolean;
  earnings: Earning[];
}

interface PayoutAccountStatus {
  hasAccount: boolean;
  stripeAccountId?: string;
  onboardingStatus: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  currentlyDue: string[];
}

interface Earning {
  id: string;
  bookingId: string;
  grossAmount: string;
  platformFeePercent: string;
  platformFeeAmount: string;
  netAmount: string;
  status: string;
  createdAt: string;
  booking?: {
    pickupAddress: string;
    dropoffAddress: string;
    preferredDate: string;
    loadSize: string;
  };
  customerName: string;
}

export function MoverPayoutCenter() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch payout summary
  const { data: summary, isLoading: summaryLoading } = useQuery<PayoutSummary>({
    queryKey: ["/api/movers/payouts/summary"],
  });

  // Fetch account status
  const { data: accountStatus, isLoading: accountLoading } = useQuery<PayoutAccountStatus>({
    queryKey: ["/api/movers/payouts/account"],
  });

  // Fetch earnings history
  const { data: earningsData, isLoading: earningsLoading } = useQuery<EarningsResponse>({
    queryKey: ["/api/movers/payouts/earnings"],
  });
  
  // Extract earnings array from response
  const earnings = earningsData?.earnings || [];

  // Onboarding mutation
  const onboardingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/movers/payouts/onboarding-link");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, "_blank");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start onboarding",
        variant: "destructive",
      });
    },
  });

  // Refresh status mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/movers/payouts/refresh-status");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/movers/payouts/account"] });
      queryClient.invalidateQueries({ queryKey: ["/api/movers/payouts/summary"] });
      toast({
        title: "Refreshed",
        description: "Account status updated",
      });
      setIsRefreshing(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to refresh status",
        variant: "destructive",
      });
      setIsRefreshing(false);
    },
  });

  const handleRefresh = () => {
    setIsRefreshing(true);
    refreshMutation.mutate();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "complete":
        return <Badge className="bg-green-500/10 text-green-700 dark:text-green-400" data-testid="badge-status-complete"><CheckCircle className="w-3 h-3 mr-1" /> Active</Badge>;
      case "in_progress":
        return <Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" data-testid="badge-status-in-progress"><Clock className="w-3 h-3 mr-1" /> In Progress</Badge>;
      case "restricted":
        return <Badge className="bg-red-500/10 text-red-700 dark:text-red-400" data-testid="badge-status-restricted"><AlertCircle className="w-3 h-3 mr-1" /> Action Required</Badge>;
      default:
        return <Badge variant="secondary" data-testid="badge-status-pending"><Clock className="w-3 h-3 mr-1" /> Not Set Up</Badge>;
    }
  };

  const getEarningStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-500/10 text-green-700 dark:text-green-400"><CheckCircle className="w-3 h-3 mr-1" /> Paid</Badge>;
      case "available":
        return <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400"><DollarSign className="w-3 h-3 mr-1" /> Available</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (summaryLoading || accountLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-8 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show profile setup prompt when mover profile is missing
  if (summary?.profileMissing) {
    return (
      <div className="space-y-6">
        <Card className="border-2 border-blue-500/30" data-testid="card-profile-missing">
          <CardContent className="p-8">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Wallet className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Complete Your Mover Profile</h3>
                <p className="text-muted-foreground mt-2">
                  Set up your mover profile to unlock payouts and start accepting jobs.
                </p>
              </div>
              <Button 
                onClick={() => setLocation("/mover-profile")}
                data-testid="button-setup-profile-payout"
              >
                Set Up Profile
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2" data-testid="text-payout-title">
            <Wallet className="w-6 h-6 text-primary" />
            Payout Center
          </h2>
          <p className="text-muted-foreground">
            Manage your earnings and payouts
          </p>
        </div>
        {accountStatus?.hasAccount && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            data-testid="button-refresh-status"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh Status
          </Button>
        )}
      </div>

      {/* Account Status Card */}
      <Card className="border-2" data-testid="card-payout-account">
        <CardHeader className="bg-gradient-to-r from-blue-500/10 to-purple-500/10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <CreditCard className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Payout Account</CardTitle>
                <CardDescription>Your Stripe Connect account for receiving payouts</CardDescription>
              </div>
            </div>
            {getStatusBadge(accountStatus?.onboardingStatus || "not_started")}
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {!accountStatus?.hasAccount ? (
            <div className="text-center py-6 space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Building className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">Set Up Payouts</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Connect your bank account to receive payouts for completed jobs. 
                  LervIT uses Stripe for secure, fast payments.
                </p>
              </div>
              <Button
                onClick={() => onboardingMutation.mutate()}
                disabled={onboardingMutation.isPending}
                className="gap-2"
                data-testid="button-start-onboarding"
              >
                {onboardingMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                Set Up Payout Account
              </Button>
            </div>
          ) : accountStatus.onboardingStatus !== "complete" ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-yellow-700 dark:text-yellow-400">Action Required</p>
                  <p className="text-sm text-muted-foreground">
                    Complete your Stripe account setup to start receiving payouts.
                  </p>
                  {accountStatus.currentlyDue && accountStatus.currentlyDue.length > 0 && (
                    <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside">
                      {accountStatus.currentlyDue.slice(0, 3).map((item, i) => (
                        <li key={i}>{item.replace(/_/g, " ").replace(".", " - ")}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <Button
                onClick={() => onboardingMutation.mutate()}
                disabled={onboardingMutation.isPending}
                className="gap-2"
                data-testid="button-continue-onboarding"
              >
                {onboardingMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                Complete Setup
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <div>
                <p className="font-medium text-green-700 dark:text-green-400">Account Active</p>
                <p className="text-sm text-muted-foreground">
                  Your payout account is fully set up and ready to receive payments.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Earnings Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-pending-earnings">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">${summary?.pendingEarnings || "0.00"}</p>
                <p className="text-xs text-muted-foreground">Processing</p>
              </div>
              <div className="p-3 rounded-full bg-yellow-500/10">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-available-balance">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Available</p>
                <p className="text-2xl font-bold text-green-600">${summary?.availableBalance || "0.00"}</p>
                <p className="text-xs text-muted-foreground">Ready for payout</p>
              </div>
              <div className="p-3 rounded-full bg-green-500/10">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-total-paid">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Paid Out</p>
                <p className="text-2xl font-bold">${summary?.totalPaidOut || "0.00"}</p>
                <p className="text-xs text-muted-foreground">All time</p>
              </div>
              <div className="p-3 rounded-full bg-blue-500/10">
                <ArrowUpRight className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-completed-jobs">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed Jobs</p>
                <p className="text-2xl font-bold">{summary?.completedJobs || 0}</p>
                <p className="text-xs text-muted-foreground">{summary?.platformFeePercent || 15}% platform fee</p>
              </div>
              <div className="p-3 rounded-full bg-purple-500/10">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Earnings History */}
      <Card data-testid="card-earnings-history">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Earnings History
          </CardTitle>
          <CardDescription>Your recent job earnings and platform fees</CardDescription>
        </CardHeader>
        <CardContent>
          {earningsLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !earnings || earnings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No earnings yet</p>
              <p className="text-sm">Complete jobs to start earning</p>
            </div>
          ) : (
            <div className="space-y-4">
              {earnings.map((earning) => (
                <div
                  key={earning.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg border hover-elevate"
                  data-testid={`earning-row-${earning.id}`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{earning.customerName}</span>
                      {getEarningStatusBadge(earning.status)}
                    </div>
                    {earning.booking && (
                      <p className="text-sm text-muted-foreground">
                        {earning.booking.pickupAddress.split(",")[0]} → {earning.booking.dropoffAddress.split(",")[0]}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(earning.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600">${earning.netAmount}</p>
                    <p className="text-xs text-muted-foreground">
                      ${earning.grossAmount} - ${earning.platformFeeAmount} ({earning.platformFeePercent}% fee)
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform Fee Info */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-full bg-muted">
              <Building className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h4 className="font-medium">Platform Fee: {summary?.platformFeePercent || 15}%</h4>
              <p className="text-sm text-muted-foreground">
                LervIT charges a {summary?.platformFeePercent || 15}% platform fee on each completed job to cover payment processing, 
                insurance, customer support, and platform operations. Your earnings are automatically calculated 
                after this fee is deducted.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

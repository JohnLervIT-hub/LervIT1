import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  ArrowLeft, 
  DollarSign, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  Send,
  RefreshCw,
  Wallet,
  Banknote,
  Tag
} from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PendingPayout = {
  earningsId: string;
  bookingId: string;
  moverId: string;
  moverName: string;
  grossAmount: string;
  platformFee: string;
  netAmount: string;
  hasStripeAccount: boolean;
  isReadyToPay: boolean;
  createdAt: string;
};

type PendingPayoutsResponse = {
  success: boolean;
  totalPending: string;
  readyToPay: string;
  needsStripeSetup: string;
  count: number;
  payouts: PendingPayout[];
};

type ProcessPayoutsResponse = {
  success: boolean;
  message: string;
  totalPaid: string;
  processed: { earningsId: string; moverId: string; amount: string; transferId: string }[];
  failed: { earningsId: string; moverId: string; reason: string }[];
  skipped: { earningsId: string; moverId: string; reason: string }[];
};

type MoverEarning = {
  id: string;
  bookingId: string;
  moverId: string;
  grossAmount: string;
  platformFeePercent: string;
  platformFeeAmount: string;
  netAmount: string;
  status: string;
  stripeTransferId: string | null;
  paidAt: string | null;
  createdAt: string;
  _isMissing?: boolean;
};

type PromoBalance = {
  id: string;
  promoCode: string;
  discountPercent: string;
  discountAmount: string;
  moverBalanceOwed: string;
  moverBalancePaid: boolean;
  price: string;
  subtotal: string;
  status: string;
  moverId: string | null;
  moverName: string;
  customerName: string;
  createdAt: string;
};

type BackfillResponse = {
  success: boolean;
  message: string;
  created: number;
};

type MarkManuallyPaidResponse = {
  success: boolean;
  message: string;
  updated: { earningsId: string; moverId: string; amount: string }[];
  failed: { earningsId: string; reason: string }[];
};

type SyncStripeResponse = {
  success: boolean;
  message: string;
  status: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    onboardingStatus: string;
    currentlyDue: string[];
  };
};

type ManualTransferResponse = {
  success: boolean;
  message: string;
  transfer: {
    id: string;
    amount: string;
    grossAmount: string;
    platformFee: string;
  };
};

export default function AdminPayoutsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedEarnings, setSelectedEarnings] = useState<string[]>([]);
  const [manualPayDialogOpen, setManualPayDialogOpen] = useState(false);
  const [manualPayReference, setManualPayReference] = useState("");

  const { data: pendingData, isLoading: loadingPending, refetch: refetchPending } = useQuery<PendingPayoutsResponse>({
    queryKey: ["/api/admin/pending-payouts"],
  });

  const { data: allEarnings, isLoading: loadingEarnings, refetch: refetchEarnings } = useQuery<MoverEarning[]>({
    queryKey: ["/api/admin/mover-earnings"],
  });

  const { data: promoBalances, isLoading: loadingPromoBalances, refetch: refetchPromoBalances } = useQuery<PromoBalance[]>({
    queryKey: ["/api/admin/promo-balances"],
  });

  const markPromoBalancePaidMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await apiRequest("POST", `/api/admin/promo-balances/${bookingId}/mark-paid`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Balance Marked Paid", description: "Mover balance has been marked as paid." });
      refetchPromoBalances();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const processPayoutsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/process-pending-payouts");
      return res.json();
    },
    onSuccess: (data: ProcessPayoutsResponse) => {
      toast({
        title: "Payouts Processed",
        description: `${data.processed.length} payouts completed ($${data.totalPaid}). ${data.failed.length} failed, ${data.skipped.length} skipped.`,
      });
      refetchPending();
      refetchEarnings();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-payouts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process payouts",
        variant: "destructive",
      });
    },
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/backfill-mover-earnings");
      return res.json();
    },
    onSuccess: (data: BackfillResponse) => {
      toast({
        title: "Backfill Complete",
        description: data.message || `Created ${data.created} earnings records`,
      });
      refetchPending();
      refetchEarnings();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to backfill earnings",
        variant: "destructive",
      });
    },
  });

  const markManuallyPaidMutation = useMutation({
    mutationFn: async ({ earningsIds, reference }: { earningsIds: string[]; reference: string }) => {
      const res = await apiRequest("POST", "/api/admin/mark-manually-paid", { earningsIds, reference });
      return res.json();
    },
    onSuccess: (data: MarkManuallyPaidResponse) => {
      toast({
        title: "Marked as Paid",
        description: data.message || `${data.updated.length} earnings marked as manually paid`,
      });
      setSelectedEarnings([]);
      setManualPayDialogOpen(false);
      setManualPayReference("");
      refetchPending();
      refetchEarnings();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark as paid",
        variant: "destructive",
      });
    },
  });

  const syncStripeStatusMutation = useMutation({
    mutationFn: async (moverId: string) => {
      const res = await apiRequest("POST", `/api/admin/sync-mover-stripe/${moverId}`);
      return res.json();
    },
    onSuccess: (data: SyncStripeResponse) => {
      toast({
        title: "Stripe Status Synced",
        description: `Charges: ${data.status.chargesEnabled ? 'Enabled' : 'Disabled'}, Payouts: ${data.status.payoutsEnabled ? 'Enabled' : 'Disabled'}`,
      });
      refetchPending();
      refetchEarnings();
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync Stripe status",
        variant: "destructive",
      });
    },
  });

  const manualTransferMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await apiRequest("POST", `/api/admin/manual-transfer/${bookingId}`);
      return res.json();
    },
    onSuccess: (data: ManualTransferResponse) => {
      toast({
        title: "Transfer Successful",
        description: `Transferred $${data.transfer.amount} to mover (Platform fee: $${data.transfer.platformFee})`,
      });
      refetchPending();
      refetchEarnings();
    },
    onError: (error: Error) => {
      toast({
        title: "Transfer Failed",
        description: error.message || "Failed to create transfer",
        variant: "destructive",
      });
    },
  });

  const handleMarkManuallyPaid = () => {
    if (selectedEarnings.length === 0) return;
    markManuallyPaidMutation.mutate({
      earningsIds: selectedEarnings,
      reference: manualPayReference || `manual_bank_transfer_${new Date().toISOString().slice(0, 10)}`,
    });
  };

  const toggleEarningSelection = (earningsId: string) => {
    setSelectedEarnings(prev =>
      prev.includes(earningsId)
        ? prev.filter(id => id !== earningsId)
        : [...prev, earningsId]
    );
  };

  const toggleAllEarnings = (earningsIds: string[]) => {
    const allSelected = earningsIds.every(id => selectedEarnings.includes(id));
    if (allSelected) {
      setSelectedEarnings(prev => prev.filter(id => !earningsIds.includes(id)));
    } else {
      setSelectedEarnings(prev => Array.from(new Set([...prev, ...earningsIds])));
    }
  };

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">This page is only available for administrators.</p>
        </div>
      </div>
    );
  }

  const pendingPayouts = pendingData?.payouts || [];
  const readyPayouts = pendingPayouts.filter(p => p.isReadyToPay);
  const notReadyPayouts = pendingPayouts.filter(p => !p.isReadyToPay);
  
  const paidEarnings = allEarnings?.filter(e => e.status === 'paid' || e.status === 'available') || [];
  const pendingEarnings = allEarnings?.filter(e => e.status === 'pending') || [];
  const missingEarnings = allEarnings?.filter(e => e.status === 'needs_backfill' || e._isMissing) || [];

  const handleProcessPayouts = async () => {
    setIsProcessing(true);
    try {
      await processPayoutsMutation.mutateAsync();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 bg-gradient-to-b from-green-50/50 to-background dark:from-green-950/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="mb-4 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20" data-testid="button-back-admin">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-500 rounded-lg">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold">Mover Payouts</h1>
              </div>
              <p className="text-muted-foreground text-lg">Manage and reconcile mover earnings</p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => { refetchPending(); refetchEarnings(); }}
              data-testid="button-refresh-payouts"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Total Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                ${pendingData?.totalPending || "0.00"}
              </div>
              <p className="text-xs text-muted-foreground">{pendingData?.count || 0} payouts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Ready to Pay
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                ${pendingData?.readyToPay || "0.00"}
              </div>
              <p className="text-xs text-muted-foreground">{readyPayouts.length} movers verified</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Needs Setup
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                ${pendingData?.needsStripeSetup || "0.00"}
              </div>
              <p className="text-xs text-muted-foreground">{notReadyPayouts.length} movers unverified</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Total Paid
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${paidEarnings.reduce((sum, e) => sum + parseFloat(e.netAmount), 0).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">{paidEarnings.length} transfers completed</p>
            </CardContent>
          </Card>
        </div>

        {/* Process Payouts Button */}
        {readyPayouts.length > 0 && (
          <Card className="mb-6 border-green-200 bg-green-50/50 dark:bg-green-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">Process All Ready Payouts</h3>
                  <p className="text-muted-foreground">
                    Transfer ${pendingData?.readyToPay} to {readyPayouts.length} verified mover(s)
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      size="lg" 
                      className="bg-green-600 hover:bg-green-700"
                      disabled={isProcessing}
                      data-testid="button-process-payouts"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      Process Payouts
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm Payout Processing</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will transfer ${pendingData?.readyToPay} to {readyPayouts.length} mover(s) via Stripe. 
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleProcessPayouts} className="bg-green-600 hover:bg-green-700">
                        Yes, Process Payouts
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Backfill Alert for Missing Earnings */}
        {missingEarnings.length > 0 && (
          <Card className="mb-6 border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    Missing Earnings Records
                  </h3>
                  <p className="text-muted-foreground">
                    {missingEarnings.length} completed booking(s) need earnings records created
                  </p>
                </div>
                <Button 
                  variant="outline"
                  className="border-amber-400 text-amber-700 hover:bg-amber-100"
                  onClick={() => backfillMutation.mutate()}
                  disabled={backfillMutation.isPending}
                  data-testid="button-backfill-earnings"
                >
                  {backfillMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Backfill Earnings
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs for different views */}
        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pending ({pendingPayouts.length})
            </TabsTrigger>
            <TabsTrigger value="paid" data-testid="tab-paid">
              Paid ({paidEarnings.length})
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">
              All Earnings ({allEarnings?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="promo" data-testid="tab-promo">
              Promo Balances {promoBalances?.filter(b => !b.moverBalancePaid).length ? `(${promoBalances.filter(b => !b.moverBalancePaid).length})` : ''}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>Pending Payouts</CardTitle>
                  <CardDescription>Movers awaiting payment for completed jobs</CardDescription>
                </div>
                {selectedEarnings.length > 0 && (
                  <Button
                    variant="outline"
                    className="border-blue-400 text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                    onClick={() => setManualPayDialogOpen(true)}
                    data-testid="button-mark-manually-paid"
                  >
                    <Banknote className="w-4 h-4 mr-2" />
                    Mark as Manually Paid ({selectedEarnings.length})
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {loadingPending ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : pendingPayouts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No pending payouts</p>
                ) : (
                  <>
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        <strong>Tip:</strong> Select payouts you've already paid via bank transfer or e-transfer, then click "Mark as Manually Paid" to update your records.
                      </p>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]">
                            <Checkbox
                              checked={pendingPayouts.every(p => selectedEarnings.includes(p.earningsId))}
                              onCheckedChange={() => toggleAllEarnings(pendingPayouts.map(p => p.earningsId))}
                              data-testid="checkbox-select-all"
                            />
                          </TableHead>
                          <TableHead>Mover</TableHead>
                          <TableHead>Booking</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">Fee (15%)</TableHead>
                          <TableHead className="text-right">Net Payout</TableHead>
                          <TableHead>Stripe Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingPayouts.map((payout) => (
                          <TableRow 
                            key={payout.earningsId}
                            className={selectedEarnings.includes(payout.earningsId) ? "bg-blue-50 dark:bg-blue-950/20" : ""}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedEarnings.includes(payout.earningsId)}
                                onCheckedChange={() => toggleEarningSelection(payout.earningsId)}
                                data-testid={`checkbox-select-${payout.earningsId}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{payout.moverName}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {payout.bookingId.slice(0, 8)}...
                            </TableCell>
                            <TableCell className="text-right">${payout.grossAmount}</TableCell>
                            <TableCell className="text-right text-muted-foreground">${payout.platformFee}</TableCell>
                            <TableCell className="text-right font-semibold text-green-600">${payout.netAmount}</TableCell>
                            <TableCell>
                              {payout.isReadyToPay ? (
                                <Badge variant="default" className="bg-green-500">Ready</Badge>
                              ) : payout.hasStripeAccount ? (
                                <Badge variant="secondary">Pending Verification</Badge>
                              ) : (
                                <Badge variant="destructive">No Account</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {payout.createdAt ? format(new Date(payout.createdAt), "MMM d, yyyy") : "-"}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {payout.hasStripeAccount && !payout.isReadyToPay && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => syncStripeStatusMutation.mutate(payout.moverId)}
                                    disabled={syncStripeStatusMutation.isPending}
                                    data-testid={`button-sync-stripe-${payout.moverId}`}
                                  >
                                    {syncStripeStatusMutation.isPending ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <RefreshCw className="w-3 h-3" />
                                    )}
                                  </Button>
                                )}
                                {payout.isReadyToPay && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-green-600 border-green-300 hover:bg-green-50"
                                    onClick={() => manualTransferMutation.mutate(payout.bookingId)}
                                    disabled={manualTransferMutation.isPending}
                                    data-testid={`button-transfer-${payout.bookingId}`}
                                  >
                                    {manualTransferMutation.isPending ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Send className="w-3 h-3" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="paid">
            <Card>
              <CardHeader>
                <CardTitle>Completed Payouts</CardTitle>
                <CardDescription>Successfully transferred to movers</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingEarnings ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : paidEarnings.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No completed payouts yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Booking</TableHead>
                        <TableHead>Mover ID</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Fee</TableHead>
                        <TableHead className="text-right">Net Paid</TableHead>
                        <TableHead>Transfer ID</TableHead>
                        <TableHead>Paid At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paidEarnings.map((earning) => (
                        <TableRow key={earning.id}>
                          <TableCell className="text-xs">{earning.bookingId.slice(0, 8)}...</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{earning.moverId.slice(0, 8)}...</TableCell>
                          <TableCell className="text-right">${earning.grossAmount}</TableCell>
                          <TableCell className="text-right text-muted-foreground">${earning.platformFeeAmount}</TableCell>
                          <TableCell className="text-right font-semibold text-green-600">${earning.netAmount}</TableCell>
                          <TableCell className="text-xs">
                            {earning.stripeTransferId ? (
                              earning.stripeTransferId.startsWith('destination_charge') ? (
                                <Badge variant="outline" className="text-xs">Auto-split</Badge>
                              ) : earning.stripeTransferId.startsWith('manual_bank_transfer') ? (
                                <Badge variant="outline" className="text-xs border-blue-400 text-blue-600">Manual</Badge>
                              ) : (
                                <span className="text-muted-foreground">{earning.stripeTransferId.slice(0, 12)}...</span>
                              )
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {earning.paidAt ? format(new Date(earning.paidAt), "MMM d, HH:mm") : 
                             earning.createdAt ? format(new Date(earning.createdAt), "MMM d, HH:mm") : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all">
            <Card>
              <CardHeader>
                <CardTitle>All Mover Earnings</CardTitle>
                <CardDescription>Complete earnings history</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingEarnings ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : !allEarnings?.length ? (
                  <p className="text-center text-muted-foreground py-8">No earnings records</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Booking</TableHead>
                        <TableHead>Mover ID</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Fee ({allEarnings[0]?.platformFeePercent || 15}%)</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allEarnings.map((earning) => (
                        <TableRow key={earning.id}>
                          <TableCell className="text-xs">{earning.bookingId.slice(0, 8)}...</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{earning.moverId.slice(0, 8)}...</TableCell>
                          <TableCell className="text-right">${earning.grossAmount}</TableCell>
                          <TableCell className="text-right text-muted-foreground">${earning.platformFeeAmount}</TableCell>
                          <TableCell className="text-right font-semibold">${earning.netAmount}</TableCell>
                          <TableCell>
                            {earning.status === 'paid' || earning.status === 'available' ? (
                              <Badge variant="default" className="bg-green-500">Paid</Badge>
                            ) : earning.status === 'needs_backfill' || earning._isMissing ? (
                              <Badge variant="outline" className="border-amber-400 text-amber-700">Needs Backfill</Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {earning.createdAt ? format(new Date(earning.createdAt), "MMM d, yyyy") : "-"}
                          </TableCell>
                          <TableCell>
                            {(earning.status === 'needs_backfill' || earning._isMissing || earning.status === 'pending') && (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600 border-green-300 hover:bg-green-50"
                                  onClick={() => manualTransferMutation.mutate(earning.bookingId)}
                                  disabled={manualTransferMutation.isPending}
                                  title="Create Stripe transfer to mover"
                                  data-testid={`button-transfer-all-${earning.bookingId}`}
                                >
                                  {manualTransferMutation.isPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Send className="w-3 h-3" />
                                  )}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="promo">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="w-5 h-5" />
                    Promo Code Mover Balances
                  </CardTitle>
                  <CardDescription>
                    When promo codes are used, movers receive 85% of the discounted price via Stripe auto-payout. 
                    The balance (85% of discount amount) must be manually topped up to ensure movers get their full 85%.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchPromoBalances()} data-testid="button-refresh-promo">
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {loadingPromoBalances ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : !promoBalances?.length ? (
                  <p className="text-center text-muted-foreground py-8">No promo code bookings yet</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Total Balance Owed</p>
                        <p className="text-2xl font-bold text-amber-600">
                          ${promoBalances.filter(b => !b.moverBalancePaid).reduce((sum, b) => sum + parseFloat(b.moverBalanceOwed || '0'), 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Already Paid</p>
                        <p className="text-2xl font-bold text-green-600">
                          ${promoBalances.filter(b => b.moverBalancePaid).reduce((sum, b) => sum + parseFloat(b.moverBalanceOwed || '0'), 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Booking</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Mover</TableHead>
                          <TableHead>Promo</TableHead>
                          <TableHead className="text-right">Original</TableHead>
                          <TableHead className="text-right">Discount</TableHead>
                          <TableHead className="text-right">Balance Owed</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {promoBalances.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell className="text-xs">{b.id.slice(0, 8)}...</TableCell>
                            <TableCell className="text-xs">{b.customerName}</TableCell>
                            <TableCell className="text-xs">{b.moverName}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{b.promoCode} (-{b.discountPercent}%)</Badge>
                            </TableCell>
                            <TableCell className="text-right">${b.subtotal}</TableCell>
                            <TableCell className="text-right text-green-600">-${b.discountAmount}</TableCell>
                            <TableCell className="text-right font-semibold text-amber-600">${b.moverBalanceOwed}</TableCell>
                            <TableCell>
                              {b.moverBalancePaid ? (
                                <Badge variant="default" className="bg-green-500">Paid</Badge>
                              ) : (
                                <Badge variant="secondary">Unpaid</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {!b.moverBalancePaid && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => markPromoBalancePaidMutation.mutate(b.id)}
                                  disabled={markPromoBalancePaidMutation.isPending}
                                  data-testid={`button-mark-promo-paid-${b.id}`}
                                >
                                  {markPromoBalancePaidMutation.isPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                  )}
                                  Mark Paid
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Mark as Manually Paid Dialog */}
        <Dialog open={manualPayDialogOpen} onOpenChange={setManualPayDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Banknote className="w-5 h-5" />
                Mark as Manually Paid
              </DialogTitle>
              <DialogDescription>
                Confirm that you have paid {selectedEarnings.length} mover(s) via bank transfer, e-transfer, or other method outside of Stripe.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium">Selected Payouts:</p>
                <p className="text-2xl font-bold text-green-600">
                  ${pendingPayouts
                    .filter(p => selectedEarnings.includes(p.earningsId))
                    .reduce((sum, p) => sum + parseFloat(p.netAmount), 0)
                    .toFixed(2)} CAD
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedEarnings.length} payout(s) to {Array.from(new Set(pendingPayouts.filter(p => selectedEarnings.includes(p.earningsId)).map(p => p.moverName))).join(", ")}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference">Payment Reference (optional)</Label>
                <Input
                  id="reference"
                  placeholder="e.g., e-transfer confirmation, bank ref #"
                  value={manualPayReference}
                  onChange={(e) => setManualPayReference(e.target.value)}
                  data-testid="input-manual-pay-reference"
                />
                <p className="text-xs text-muted-foreground">
                  Enter your e-transfer confirmation number or bank reference for your records.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setManualPayDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleMarkManuallyPaid}
                disabled={markManuallyPaidMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-confirm-manual-pay"
              >
                {markManuallyPaidMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-2" />
                )}
                Confirm Payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

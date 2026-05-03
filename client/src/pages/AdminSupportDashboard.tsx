import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
  Search,
  Filter,
  Sparkles,
  Brain,
  Lightbulb,
  Copy,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Target,
  Zap,
  User as UserIcon,
  Mail,
  Phone,
  Building2,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Link as WouterLink } from "wouter";
import type { SupportTicket, SupportTicketReply, User, AiSupportInsight } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type TicketWithUser = SupportTicket & { userName?: string; userEmail?: string; userPhone?: string; userRole?: string };
type ReplyWithUser = SupportTicketReply & { userName?: string };

type AiInsightWithCached = AiSupportInsight & { cached?: boolean };

type PartnerIncident = {
  id: string;
  bookingId: string;
  partnerId: string;
  category: string;
  severity: string;
  status: string;
  title: string;
  notes: string;
  escalationFlag: boolean;
  fileUrls: string[] | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  partnerName: string;
  reporterName: string | null;
};

export default function AdminSupportDashboard() {
  const { toast } = useToast();
  const [selectedTicket, setSelectedTicket] = useState<TicketWithUser | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [aiInsight, setAiInsight] = useState<AiInsightWithCached | null>(null);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(true);
  const [incidentStatusFilter, setIncidentStatusFilter] = useState<string>("all");
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState<string>("all");
  const [expandedIncident, setExpandedIncident] = useState<string | null>(null);
  const [resolutionDraft, setResolutionDraft] = useState<Record<string, string>>({});

  const { data: allTickets, isLoading } = useQuery<TicketWithUser[]>({
    queryKey: ["/api/support/tickets/all"],
  });

  const { data: partnerIncidentList = [], isLoading: incidentsLoading } = useQuery<PartnerIncident[]>({
    queryKey: ["/api/admin/partner-incidents"],
    refetchInterval: 30000,
  });

  const updateIncident = useMutation({
    mutationFn: ({ id, status, resolutionNotes }: { id: string; status?: string; resolutionNotes?: string }) =>
      apiRequest("PUT", `/api/admin/partner-incidents/${id}`, { status, resolutionNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partner-incidents"] });
      toast({ title: "Incident updated" });
    },
    onError: () => toast({ title: "Failed to update incident", variant: "destructive" }),
  });

  const { data: ticketDetails } = useQuery<{ ticket: SupportTicket; replies: SupportTicketReply[] }>({
    queryKey: ["/api/support/tickets", selectedTicket?.id],
    enabled: !!selectedTicket,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: string }) => {
      const res = await fetch(`/api/support/tickets/${ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", selectedTicket?.id] });
      toast({
        title: "Status updated",
        description: "Ticket status has been updated successfully.",
      });
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ ticketId, message }: { ticketId: string; message: string }) => {
      const res = await fetch(`/api/support/tickets/${ticketId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error("Failed to send reply");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", selectedTicket?.id] });
      setReplyMessage("");
      toast({
        title: "Reply sent",
        description: "Your reply has been sent to the user.",
      });
    },
  });

  const aiAnalyzeMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      const res = await fetch(`/api/support/tickets/${ticketId}/ai-analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to analyze ticket");
      return res.json() as Promise<AiInsightWithCached>;
    },
    onSuccess: (data) => {
      setAiInsight(data);
      toast({
        title: data.cached ? "AI Insights Loaded" : "AI Analysis Complete",
        description: data.cached 
          ? "Showing cached analysis from earlier." 
          : `Analysis completed with ${data.confidence}% confidence.`,
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Analysis Failed",
        description: "Could not analyze this ticket. Please try again.",
      });
    },
  });

  const handleCopyResponse = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Response copied to clipboard.",
    });
  };

  const handleUseResponse = (text: string) => {
    setReplyMessage(text);
    toast({
      title: "Response Added",
      description: "AI suggestion added to reply box. Feel free to customize it.",
    });
  };

  const filteredTickets = allTickets?.filter((ticket) => {
    const matchesStatus = filterStatus === "all" || ticket.status === filterStatus;
    const matchesPriority = filterPriority === "all" || ticket.priority === filterPriority;
    const q = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === "" || 
      ticket.subject.toLowerCase().includes(q) ||
      ticket.message.toLowerCase().includes(q) ||
      (ticket.userName && ticket.userName.toLowerCase().includes(q)) ||
      (ticket.userEmail && ticket.userEmail.toLowerCase().includes(q)) ||
      (ticket.userPhone && ticket.userPhone.includes(searchQuery));
    
    return matchesStatus && matchesPriority && matchesSearch;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open":
        return <Clock className="w-4 h-4" />;
      case "in_progress":
        return <AlertCircle className="w-4 h-4" />;
      case "resolved":
      case "closed":
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "in_progress":
        return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
      case "resolved":
      case "closed":
        return "bg-green-500/10 text-green-700 dark:text-green-400";
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "low":
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
      case "normal":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "high":
        return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
      case "urgent":
        return "bg-red-500/10 text-red-700 dark:text-red-400";
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  const ticketStats = {
    total: allTickets?.length || 0,
    open: allTickets?.filter((t) => t.status === "open").length || 0,
    inProgress: allTickets?.filter((t) => t.status === "in_progress").length || 0,
    resolved: allTickets?.filter((t) => t.status === "resolved" || t.status === "closed").length || 0,
  };

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-admin">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Command Center
            </Button>
          </Link>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-violet-500/10 rounded-lg">
              <MessageSquare className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight" data-testid="text-admin-support-title">Support Center</h1>
              <p className="text-sm text-muted-foreground">Manage customer tickets and partner incidents</p>
            </div>
          </div>

          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Tickets</CardTitle>
                <Filter className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums" data-testid="text-total-tickets">{ticketStats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Open</CardTitle>
                <Clock className="w-4 h-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-blue-600" data-testid="text-open-tickets">{ticketStats.open}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">In Progress</CardTitle>
                <AlertCircle className="w-4 h-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-amber-600" data-testid="text-inprogress-tickets">{ticketStats.inProgress}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resolved</CardTitle>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-green-600" data-testid="text-resolved-tickets">{ticketStats.resolved}</div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Tabs defaultValue="tickets" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="tickets" data-testid="tab-support-tickets">
              Customer Tickets
              {ticketStats.open > 0 && (
                <span className="ml-2 text-xs bg-blue-500/15 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded">
                  {ticketStats.open}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="incidents" data-testid="tab-partner-incidents">
              Partner Incidents
              {partnerIncidentList.filter(i => i.status !== "resolved").length > 0 && (
                <span className="ml-2 text-xs bg-orange-500/15 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded">
                  {partnerIncidentList.filter(i => i.status !== "resolved").length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tickets">
        {/* Filters */}
        <Card className="mb-6 shadow-sm">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by ticket, name, email, or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-11"
                    data-testid="input-admin-search"
                  />
                </div>
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-11" data-testid="select-admin-filter-status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="h-11" data-testid="select-admin-filter-priority">
                  <SelectValue placeholder="All priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

      {/* Tickets List */}
      <Card>
        <CardHeader>
          <CardTitle>All Tickets</CardTitle>
          <CardDescription>
            {filteredTickets?.length || 0} tickets found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading tickets...</div>
          ) : filteredTickets && filteredTickets.length > 0 ? (
            <div className="space-y-3">
              {filteredTickets.map((ticket) => (
                <Dialog key={ticket.id}>
                  <DialogTrigger asChild>
                    <Card 
                      className="hover-elevate cursor-pointer"
                      onClick={() => {
                        setSelectedTicket(ticket);
                        setAiInsight(null);
                      }}
                      data-testid={`card-admin-ticket-${ticket.id}`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <CardTitle className="text-lg mb-1">{ticket.subject}</CardTitle>
                            {(ticket.userName || ticket.userEmail) && (
                              <div className="flex flex-wrap items-center gap-3 mb-2 text-sm text-muted-foreground">
                                {ticket.userName && (
                                  <span className="flex items-center gap-1" data-testid={`text-ticket-user-${ticket.id}`}>
                                    <UserIcon className="w-3.5 h-3.5" />
                                    {ticket.userName}
                                  </span>
                                )}
                                {ticket.userEmail && (
                                  <span className="flex items-center gap-1" data-testid={`text-ticket-email-${ticket.id}`}>
                                    <Mail className="w-3.5 h-3.5" />
                                    {ticket.userEmail}
                                  </span>
                                )}
                                {ticket.userPhone && (
                                  <span className="flex items-center gap-1" data-testid={`text-ticket-phone-${ticket.id}`}>
                                    <Phone className="w-3.5 h-3.5" />
                                    {ticket.userPhone}
                                  </span>
                                )}
                                {ticket.userRole && (
                                  <Badge variant="secondary" className="text-xs capitalize" data-testid={`badge-ticket-role-${ticket.id}`}>
                                    {ticket.userRole}
                                  </Badge>
                                )}
                              </div>
                            )}
                            <CardDescription className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="capitalize">
                                {ticket.category}
                              </Badge>
                              <Badge className={`capitalize ${getPriorityColor(ticket.priority)}`}>
                                {ticket.priority}
                              </Badge>
                              <span className="text-xs">
                                {new Date(ticket.createdAt).toLocaleString()}
                              </span>
                            </CardDescription>
                          </div>
                          <Badge className={`capitalize flex items-center gap-1 ${getStatusColor(ticket.status)}`}>
                            {getStatusIcon(ticket.status)}
                            {ticket.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {ticket.message}
                        </p>
                      </CardContent>
                    </Card>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{ticket.subject}</DialogTitle>
                      <DialogDescription>
                        Ticket #{ticket.id.slice(0, 8)}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                      {/* User Info */}
                      {(ticket.userName || ticket.userEmail) && (
                        <div className="bg-muted/50 rounded-md p-3 flex flex-wrap items-center gap-4 text-sm">
                          {ticket.userName && (
                            <span className="flex items-center gap-1.5 font-medium" data-testid="text-dialog-user-name">
                              <UserIcon className="w-4 h-4 text-muted-foreground" />
                              {ticket.userName}
                            </span>
                          )}
                          {ticket.userEmail && (
                            <span className="flex items-center gap-1.5 text-muted-foreground" data-testid="text-dialog-user-email">
                              <Mail className="w-4 h-4" />
                              {ticket.userEmail}
                            </span>
                          )}
                          {ticket.userPhone && (
                            <span className="flex items-center gap-1.5 text-muted-foreground" data-testid="text-dialog-user-phone">
                              <Phone className="w-4 h-4" />
                              {ticket.userPhone}
                            </span>
                          )}
                          {ticket.userRole && (
                            <Badge variant="secondary" className="text-xs capitalize">
                              {ticket.userRole}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Ticket Details */}
                      <div className="flex flex-wrap gap-2">
                        <Badge className={`capitalize ${getStatusColor(ticket.status)}`}>
                          {ticket.status.replace('_', ' ')}
                        </Badge>
                        <Badge className={`capitalize ${getPriorityColor(ticket.priority)}`}>
                          {ticket.priority}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {ticket.category}
                        </Badge>
                      </div>

                      <div className="bg-muted p-4 rounded-md">
                        <p className="text-sm">{ticket.message}</p>
                      </div>

                      {/* AI Support Copilot Panel */}
                      <Collapsible open={isAiPanelOpen} onOpenChange={setIsAiPanelOpen}>
                        <div className="border rounded-lg bg-gradient-to-br from-violet-50/50 to-indigo-50/50 dark:from-violet-950/20 dark:to-indigo-950/20">
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center justify-between p-4 cursor-pointer hover-elevate rounded-t-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                                  <Brain className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                  <h3 className="font-semibold text-sm flex items-center gap-2">
                                    AI Support Copilot
                                    <Badge variant="secondary" className="text-xs font-normal">
                                      <Sparkles className="w-3 h-3 mr-1" />
                                      Powered by GPT-4o
                                    </Badge>
                                  </h3>
                                  <p className="text-xs text-muted-foreground">
                                    {aiInsight ? "Analysis ready" : "Click to analyze this ticket"}
                                  </p>
                                </div>
                              </div>
                              <ArrowRight className={`w-4 h-4 transition-transform ${isAiPanelOpen ? "rotate-90" : ""}`} />
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="px-4 pb-4 space-y-4">
                              {!aiInsight && !aiAnalyzeMutation.isPending && (
                                <Button
                                  onClick={() => aiAnalyzeMutation.mutate(ticket.id)}
                                  className="w-full bg-violet-600"
                                  data-testid="button-ai-analyze"
                                >
                                  <Sparkles className="w-4 h-4 mr-2" />
                                  Analyze with AI
                                </Button>
                              )}

                              {aiAnalyzeMutation.isPending && (
                                <div className="text-center py-6">
                                  <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-violet-600" />
                                  <p className="text-sm font-medium">Analyzing ticket...</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Our AI is reviewing the issue and preparing recommendations
                                  </p>
                                </div>
                              )}

                              {aiInsight && (
                                <div className="space-y-4">
                                  {/* Confidence Score */}
                                  <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="text-muted-foreground">Confidence</span>
                                        <span className="font-medium">{aiInsight.confidence}%</span>
                                      </div>
                                      <Progress value={aiInsight.confidence} className="h-2" />
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => aiAnalyzeMutation.mutate(ticket.id)}
                                      disabled={aiAnalyzeMutation.isPending}
                                      data-testid="button-ai-refresh"
                                      aria-label="Refresh AI analysis"
                                    >
                                      <RefreshCw className="w-4 h-4" />
                                    </Button>
                                  </div>

                                  {/* Summary */}
                                  <div className="bg-white/60 dark:bg-black/20 rounded-lg p-3">
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                                      <Target className="w-3 h-3" /> Summary
                                    </h4>
                                    <p className="text-sm">{aiInsight.summary}</p>
                                  </div>

                                  {/* Category & Priority Suggestions */}
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-white/60 dark:bg-black/20 rounded-lg p-3">
                                      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Category</h4>
                                      <Badge variant="outline" className="capitalize">{aiInsight.category}</Badge>
                                    </div>
                                    <div className="bg-white/60 dark:bg-black/20 rounded-lg p-3">
                                      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Suggested Priority</h4>
                                      <Badge className={`capitalize ${
                                        aiInsight.suggestedPriority === 'urgent' ? 'bg-red-500/10 text-red-700 dark:text-red-400' :
                                        aiInsight.suggestedPriority === 'high' ? 'bg-orange-500/10 text-orange-700 dark:text-orange-400' :
                                        aiInsight.suggestedPriority === 'normal' ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400' :
                                        'bg-gray-500/10 text-gray-700 dark:text-gray-400'
                                      }`}>
                                        {aiInsight.suggestedPriority}
                                      </Badge>
                                    </div>
                                  </div>

                                  {/* Root Cause */}
                                  {aiInsight.rootCause && (
                                    <div className="bg-white/60 dark:bg-black/20 rounded-lg p-3">
                                      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                                        <Zap className="w-3 h-3" /> Root Cause
                                      </h4>
                                      <p className="text-sm">{aiInsight.rootCause}</p>
                                    </div>
                                  )}

                                  {/* Recommendations */}
                                  <div className="bg-white/60 dark:bg-black/20 rounded-lg p-3">
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                                      <Lightbulb className="w-3 h-3" /> Recommended Actions
                                    </h4>
                                    <ul className="space-y-2">
                                      {aiInsight.recommendations?.map((rec, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm">
                                          <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                          <span>{rec}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>

                                  {/* Customer Response - OK to send */}
                                  {(aiInsight.customerResponse || aiInsight.suggestedResponse) && (
                                    <div className="bg-gradient-to-br from-green-100/50 to-emerald-100/50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-3 border border-green-200/50 dark:border-green-700/30">
                                      <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase flex items-center gap-1">
                                          <MessageSquare className="w-3 h-3" /> Customer Response
                                          <Badge className="ml-2 bg-green-600 text-white text-[10px] px-1.5 py-0">OK TO SEND</Badge>
                                        </h4>
                                        <div className="flex gap-1">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => handleCopyResponse(aiInsight.customerResponse || aiInsight.suggestedResponse || "")}
                                            data-testid="button-ai-copy-response"
                                          >
                                            <Copy className="w-3 h-3 mr-1" /> Copy
                                          </Button>
                                          <Button
                                            size="sm"
                                            className="h-7 text-xs bg-green-600"
                                            onClick={() => handleUseResponse(aiInsight.customerResponse || aiInsight.suggestedResponse || "")}
                                            data-testid="button-ai-use-response"
                                          >
                                            Use This
                                          </Button>
                                        </div>
                                      </div>
                                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                                        {aiInsight.customerResponse || aiInsight.suggestedResponse}
                                      </p>
                                    </div>
                                  )}

                                  {/* Internal Notes - Staff Only */}
                                  {aiInsight.internalNotes && (
                                    <div className="bg-gradient-to-br from-amber-100/50 to-orange-100/50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg p-3 border border-amber-200/50 dark:border-amber-700/30">
                                      <div className="flex items-center gap-2 mb-2">
                                        <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase flex items-center gap-1">
                                          <AlertTriangle className="w-3 h-3" /> Internal Notes
                                        </h4>
                                        <Badge className="bg-amber-600 text-white text-[10px] px-1.5 py-0">STAFF ONLY - DO NOT SEND</Badge>
                                      </div>
                                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                                        {aiInsight.internalNotes}
                                      </p>
                                    </div>
                                  )}

                                  {aiInsight.cached && (
                                    <p className="text-xs text-muted-foreground text-center">
                                      Cached analysis • Click refresh for new analysis
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>

                      {/* Replies */}
                      {ticketDetails?.replies && ticketDetails.replies.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="font-semibold">Conversation</h3>
                          {ticketDetails.replies.map((reply) => (
                            <div
                              key={reply.id}
                              className={`p-3 rounded-md ${
                                reply.isStaff
                                  ? "bg-primary/10 ml-4"
                                  : "bg-muted mr-4"
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                {reply.isStaff && <Badge variant="secondary" className="text-xs">Support</Badge>}
                                <span className="text-xs text-muted-foreground">
                                  {new Date(reply.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-sm">{reply.message}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reply Form */}
                      <div className="space-y-3">
                        <label className="text-sm font-medium">Add Reply</label>
                        <Textarea
                          placeholder="Type your response..."
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          className="min-h-24"
                          data-testid="textarea-admin-reply"
                        />
                        <Button
                          onClick={() => {
                            if (replyMessage.trim() && ticket.id) {
                              replyMutation.mutate({ ticketId: ticket.id, message: replyMessage });
                            }
                          }}
                          disabled={!replyMessage.trim() || replyMutation.isPending}
                          data-testid="button-admin-send-reply"
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Send Reply
                        </Button>
                      </div>

                      {/* Update Status */}
                      <div className="space-y-3 pt-4 border-t">
                        <label className="text-sm font-medium">Update Status</label>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ ticketId: ticket.id, status: "open" })}
                            data-testid="button-admin-status-open"
                          >
                            Open
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ ticketId: ticket.id, status: "in_progress" })}
                            data-testid="button-admin-status-inprogress"
                          >
                            In Progress
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ ticketId: ticket.id, status: "resolved" })}
                            data-testid="button-admin-status-resolved"
                          >
                            Resolved
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ ticketId: ticket.id, status: "closed" })}
                            data-testid="button-admin-status-closed"
                          >
                            Closed
                          </Button>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No support tickets found</p>
            </div>
          )}
        </CardContent>
      </Card>
          </TabsContent>

          {/* ─────────────── PARTNER INCIDENTS TAB ─────────────── */}
          <TabsContent value="incidents">
            {/* Incident filters */}
            <Card className="mb-6 shadow-sm">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Select value={incidentStatusFilter} onValueChange={setIncidentStatusFilter}>
                    <SelectTrigger data-testid="select-incident-status">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="under_review">Under Review</SelectItem>
                      <SelectItem value="escalated">Escalated</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={incidentSeverityFilter} onValueChange={setIncidentSeverityFilter}>
                    <SelectTrigger data-testid="select-incident-severity">
                      <SelectValue placeholder="Filter by severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severities</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Partner Incidents</CardTitle>
                <CardDescription>
                  {partnerIncidentList.filter(i =>
                    (incidentStatusFilter === "all" || i.status === incidentStatusFilter) &&
                    (incidentSeverityFilter === "all" || i.severity === incidentSeverityFilter)
                  ).length} incidents found — sorted by severity
                </CardDescription>
              </CardHeader>
              <CardContent>
                {incidentsLoading ? (
                  <div className="text-center py-12 text-muted-foreground">Loading incidents...</div>
                ) : partnerIncidentList.filter(i =>
                    (incidentStatusFilter === "all" || i.status === incidentStatusFilter) &&
                    (incidentSeverityFilter === "all" || i.severity === incidentSeverityFilter)
                  ).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ShieldAlert className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No incidents found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {partnerIncidentList
                      .filter(i =>
                        (incidentStatusFilter === "all" || i.status === incidentStatusFilter) &&
                        (incidentSeverityFilter === "all" || i.severity === incidentSeverityFilter)
                      )
                      .map(incident => {
                        const sevColor = incident.severity === "critical"
                          ? "bg-red-500/10 text-red-700 dark:text-red-400"
                          : incident.severity === "high"
                          ? "bg-orange-500/10 text-orange-700 dark:text-orange-400"
                          : incident.severity === "medium"
                          ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                          : "bg-gray-500/10 text-gray-600 dark:text-gray-400";
                        const statusColor = incident.status === "resolved"
                          ? "bg-green-500/10 text-green-700 dark:text-green-400"
                          : incident.status === "escalated"
                          ? "bg-red-500/10 text-red-700 dark:text-red-400"
                          : incident.status === "under_review"
                          ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                          : "bg-muted text-muted-foreground";
                        const isExpanded = expandedIncident === incident.id;
                        return (
                          <Card
                            key={incident.id}
                            className="cursor-pointer"
                            data-testid={`card-incident-${incident.id}`}
                            onClick={() => setExpandedIncident(isExpanded ? null : incident.id)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                    {incident.escalationFlag && (
                                      <span className="text-xs font-semibold bg-red-500/10 text-red-700 dark:text-red-400 px-2 py-0.5 rounded">
                                        ESCALATED
                                      </span>
                                    )}
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${sevColor}`}>
                                      {incident.severity.toUpperCase()}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded ${statusColor}`}>
                                      {incident.status.replace(/_/g, " ")}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {incident.category.replace(/_/g, " ")}
                                    </span>
                                  </div>
                                  <p className="font-medium text-sm leading-snug mb-1" data-testid={`text-incident-title-${incident.id}`}>
                                    {incident.title}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Building2 className="w-3 h-3" />
                                      {incident.partnerName}
                                    </span>
                                    <span>Booking: {incident.bookingId.slice(0, 8)}</span>
                                    <span>{new Date(incident.createdAt).toLocaleDateString()}</span>
                                    {incident.reporterName && (
                                      <span className="flex items-center gap-1">
                                        <UserIcon className="w-3 h-3" />
                                        {incident.reporterName}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Button size="icon" variant="ghost" className="shrink-0" data-testid={`button-incident-expand-${incident.id}`}>
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </Button>
                              </div>

                              {isExpanded && (
                                <div className="mt-4 pt-4 border-t space-y-4" onClick={e => e.stopPropagation()}>
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Incident Notes</p>
                                    <p className="text-sm">{incident.notes}</p>
                                  </div>
                                  {incident.resolutionNotes && (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Resolution Notes</p>
                                      <p className="text-sm">{incident.resolutionNotes}</p>
                                    </div>
                                  )}
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Resolution Notes (add / update)</p>
                                    <textarea
                                      className="w-full min-h-[80px] text-sm border rounded-md p-2 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                                      placeholder="Add resolution notes..."
                                      value={resolutionDraft[incident.id] ?? (incident.resolutionNotes ?? "")}
                                      onChange={e => setResolutionDraft(d => ({ ...d, [incident.id]: e.target.value }))}
                                      data-testid={`textarea-resolution-${incident.id}`}
                                    />
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => updateIncident.mutate({ id: incident.id, status: "under_review" })}
                                      disabled={incident.status === "under_review" || updateIncident.isPending}
                                      data-testid={`button-incident-review-${incident.id}`}
                                    >
                                      Mark Under Review
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => updateIncident.mutate({ id: incident.id, status: "escalated" })}
                                      disabled={incident.status === "escalated" || updateIncident.isPending}
                                      data-testid={`button-incident-escalate-${incident.id}`}
                                    >
                                      Escalate
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => updateIncident.mutate({
                                        id: incident.id,
                                        status: "resolved",
                                        resolutionNotes: resolutionDraft[incident.id] ?? incident.resolutionNotes ?? undefined,
                                      })}
                                      disabled={incident.status === "resolved" || updateIncident.isPending}
                                      data-testid={`button-incident-resolve-${incident.id}`}
                                    >
                                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                                      Resolve
                                    </Button>
                                    <WouterLink href={`/admin/partners/${incident.partnerId}`}>
                                      <Button size="sm" variant="ghost" data-testid={`button-incident-view-partner-${incident.id}`}>
                                        <Building2 className="w-4 h-4 mr-1.5" />
                                        View Partner
                                      </Button>
                                    </WouterLink>
                                  </div>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })
                    }
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </div>
  </div>
  );
}

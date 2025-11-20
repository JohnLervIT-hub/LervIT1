import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquare,
  Search,
  Filter,
} from "lucide-react";
import type { SupportTicket, SupportTicketReply, User } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type TicketWithUser = SupportTicket & { userName?: string; userEmail?: string };
type ReplyWithUser = SupportTicketReply & { userName?: string };

export default function AdminSupportDashboard() {
  const { toast } = useToast();
  const [selectedTicket, setSelectedTicket] = useState<TicketWithUser | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: allTickets, isLoading } = useQuery<SupportTicket[]>({
    queryKey: ["/api/support/tickets/all"],
  });

  const { data: ticketDetails } = useQuery<{ ticket: SupportTicket; replies: SupportTicketReply[] }>({
    queryKey: ["/api/support/tickets", selectedTicket?.id],
    enabled: !!selectedTicket,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: string }) => {
      return await apiRequest(`/api/support/tickets/${ticketId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
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
      return await apiRequest(`/api/support/tickets/${ticketId}/replies`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
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

  const filteredTickets = allTickets?.filter((ticket) => {
    const matchesStatus = filterStatus === "all" || ticket.status === filterStatus;
    const matchesPriority = filterPriority === "all" || ticket.priority === filterPriority;
    const matchesSearch = searchQuery === "" || 
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.message.toLowerCase().includes(searchQuery.toLowerCase());
    
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
    <div className="container max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2" data-testid="text-admin-support-title">
          Support Dashboard
        </h1>
        <p className="text-muted-foreground text-lg">
          Manage and respond to user support tickets
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-total-tickets">{ticketStats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600" data-testid="text-open-tickets">{ticketStats.open}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600" data-testid="text-inprogress-tickets">{ticketStats.inProgress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600" data-testid="text-resolved-tickets">{ticketStats.resolved}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search tickets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-admin-search"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger data-testid="select-admin-filter-status">
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
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Priority</label>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger data-testid="select-admin-filter-priority">
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
                      onClick={() => setSelectedTicket(ticket)}
                      data-testid={`card-admin-ticket-${ticket.id}`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <CardTitle className="text-lg mb-1">{ticket.subject}</CardTitle>
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
    </div>
  );
}

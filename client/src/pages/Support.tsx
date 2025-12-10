import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import { 
  HelpCircle, 
  MessageSquare, 
  Book, 
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  MapPin,
  Shield,
  Search,
  Send,
  Sparkles,
  Phone,
  Mail,
  ChevronRight,
  Loader2,
  User,
  Headphones,
  Bell,
  X
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { SupportTicket, SupportTicketReply } from "@shared/schema";

// Uber-style notification alert component
function UberNotification({ 
  show, 
  message, 
  onClose, 
  type = "info" 
}: { 
  show: boolean; 
  message: string; 
  onClose: () => void;
  type?: "info" | "success" | "warning";
}) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  const bgColors = {
    info: "bg-black dark:bg-white",
    success: "bg-emerald-600",
    warning: "bg-amber-500"
  };

  const textColors = {
    info: "text-white dark:text-black",
    success: "text-white",
    warning: "text-black"
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -50, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: -50, x: "-50%" }}
          className={`fixed top-20 left-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-full shadow-xl ${bgColors[type]} ${textColors[type]}`}
          data-testid="uber-notification"
        >
          <Bell className="w-4 h-4" />
          <span className="text-sm font-medium whitespace-nowrap">{message}</span>
          <button
            onClick={onClose}
            className="ml-2 hover:opacity-70 transition-opacity"
            data-testid="button-close-notification"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const ticketSchema = z.object({
  subject: z.string().min(5, "Subject must be at least 5 characters"),
  category: z.enum(["general", "booking", "billing", "technical"]),
  priority: z.enum(["low", "normal", "high"]),
  message: z.string().min(20, "Message must be at least 20 characters"),
});

type TicketFormData = z.infer<typeof ticketSchema>;

export default function Support() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("faq");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [hasShownNotification, setHasShownNotification] = useState(false);

  // Query for unread ticket count
  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/support/tickets/unread-count"],
    enabled: !!user,
    refetchInterval: 30000, // Poll every 30 seconds for new messages
  });

  const unreadCount = unreadData?.unreadCount || 0;

  // Show notification when there are unread messages and user hasn't seen it yet
  useEffect(() => {
    if (unreadCount > 0 && !hasShownNotification && activeTab !== "tickets") {
      setNotificationMessage(`You have ${unreadCount} new support message${unreadCount > 1 ? 's' : ''}`);
      setShowNotification(true);
      setHasShownNotification(true);
    }
  }, [unreadCount, hasShownNotification, activeTab]);

  // Mark ticket as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      const res = await fetch(`/api/support/tickets/${ticketId}/mark-read`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to mark as read");
      return res.json();
    },
    onSuccess: () => {
      // Invalidate both the unread count and the tickets list to update the UI
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
    },
  });

  const form = useForm<TicketFormData>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      subject: "",
      category: "general",
      priority: "normal",
      message: "",
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: async (data: TicketFormData) => {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create ticket");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      toast({
        title: "Ticket created!",
        description: "We'll get back to you as soon as possible.",
      });
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create support ticket. Please try again.",
        variant: "destructive",
      });
    },
  });

  const { data: myTickets } = useQuery<SupportTicket[]>({
    queryKey: ["/api/support/tickets"],
    enabled: !!user,
  });

  const { data: ticketDetails, isLoading: isLoadingDetails } = useQuery<{ ticket: SupportTicket; replies: SupportTicketReply[] }>({
    queryKey: ["/api/support/tickets", selectedTicket?.id],
    enabled: !!selectedTicket,
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
        description: "Your message has been sent to our support team.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send reply. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TicketFormData) => {
    createTicketMutation.mutate(data);
  };

  const faqData = [
    {
      category: "Getting Started",
      icon: Book,
      color: "text-blue-600",
      bgColor: "bg-blue-500/10",
      questions: [
        {
          q: "How do I request a move?",
          a: "Click 'Request Move' in the navigation menu. Fill in your pickup and dropoff addresses, select your load size, choose difficulty levels, and pick a preferred date. Our AI will instantly predict your price and find the nearest available movers!"
        },
        {
          q: "How does the pricing work?",
          a: "LervIT uses a transparent 7-component pricing system: Base Fee ($30), Distance Fee ($1/km for pickup→dropoff), Load Fee (based on size), Pickup Difficulty Fee, Dropoff Difficulty Fee, Heavy Item Fee ($15 if applicable), and Mover Travel Fee ($0.75/km for distances >5km to pickup location). If you need 2 movers, we apply a 1.30x multiplier."
        },
        {
          q: "Can I see the price before booking?",
          a: "Yes! Our AI Auto-Quote Predictor gives you an instant price estimate range after you enter your addresses. You'll also see the complete price breakdown before confirming your booking."
        },
      ]
    },
    {
      category: "Booking & Pricing",
      icon: DollarSign,
      color: "text-green-600",
      bgColor: "bg-green-500/10",
      questions: [
        {
          q: "What's included in the Base Fee?",
          a: "The Base Fee is $30 flat rate for every move. This covers mover coordination, platform fees, and basic service costs."
        },
        {
          q: "How is the Mover Travel Fee calculated?",
          a: "If the mover needs to travel more than 5km to reach your pickup location, we charge $0.75/km for the extra distance. This ensures movers are fairly compensated for their travel time."
        },
        {
          q: "What does the 2-movers multiplier mean?",
          a: "If you select 2 movers, we apply a 1.30x multiplier to the subtotal. The first mover gets the full fee, and the second mover gets 30% of the total, ensuring both are fairly compensated."
        },
        {
          q: "Can I cancel or modify my booking?",
          a: "You can cancel bookings that are 'pending' status. Once a mover accepts, please contact support to discuss modifications or cancellations."
        },
      ]
    },
    {
      category: "Movers & Matching",
      icon: MapPin,
      color: "text-primary",
      bgColor: "bg-primary/10",
      questions: [
        {
          q: "How does LervIT find movers near me?",
          a: "Our proximity matching algorithm searches for available movers within a 15km radius of your pickup location. If none are found, we expand the search to 50km and rank movers by distance to ensure you get the fastest response."
        },
        {
          q: "How long do movers have to accept a job?",
          a: "Movers receive job notifications with a 10-minute acceptance window. If a mover doesn't respond within 10 minutes, the notification expires and we notify other nearby movers."
        },
        {
          q: "Can I choose my own mover?",
          a: "Currently, LervIT automatically matches you with the nearest available movers for the fastest service. You can view mover profiles, ratings, and total moves completed."
        },
      ]
    },
    {
      category: "AI Features",
      icon: Sparkles,
      color: "text-purple-600",
      bgColor: "bg-purple-500/10",
      questions: [
        {
          q: "What is AI Auto-Quote Predictor?",
          a: "After entering your addresses, our AI predicts your price range instantly using real GPS coordinates and our pricing formula. It shows confidence percentage and natural language explanation."
        },
        {
          q: "How does AI Photo Analysis work?",
          a: "Upload photos of your items during booking, and our AI analyzes them to auto-fill load size, detect heavy items, and recommend the number of movers you'll need. This makes booking faster and more accurate!"
        },
        {
          q: "Can I get explanations for my price?",
          a: "Yes! Click 'AI Explain My Price' to get a detailed, natural language breakdown of all 7 pricing components in plain English."
        },
      ]
    },
    {
      category: "Safety & Trust",
      icon: Shield,
      color: "text-amber-600",
      bgColor: "bg-amber-500/10",
      questions: [
        {
          q: "Are movers verified?",
          a: "Yes, all movers must provide vehicle information and license details. Look for the 'Verified' badge on mover profiles for added peace of mind."
        },
        {
          q: "How do I report an issue with my move?",
          a: "Contact support immediately via the 'Contact Support' tab below. For urgent issues, select 'High' or 'Urgent' priority when creating your ticket."
        },
        {
          q: "Can I leave reviews?",
          a: "Absolutely! After your move is completed, you'll receive a prompt to rate your mover and leave a review. This helps maintain quality across the platform."
        },
      ]
    },
  ];

  const filteredFaq = faqData.map(category => ({
    ...category,
    questions: category.questions.filter(item => 
      searchQuery === "" || 
      item.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.a.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(category => category.questions.length > 0);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open": return <Clock className="w-4 h-4" />;
      case "in_progress": return <AlertCircle className="w-4 h-4" />;
      case "resolved":
      case "closed": return <CheckCircle2 className="w-4 h-4" />;
      default: return <HelpCircle className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "bg-blue-500/10 text-blue-600";
      case "in_progress": return "bg-amber-500/10 text-amber-600";
      case "resolved":
      case "closed": return "bg-green-500/10 text-green-600";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="min-h-screen pt-20 pb-12 bg-background">
      {/* Uber-style notification */}
      <UberNotification
        show={showNotification}
        message={notificationMessage}
        onClose={() => setShowNotification(false)}
        type="info"
      />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Page Header */}
        <div className="py-6 mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="text-support-title">
            Help & Support
          </h1>
          <p className="text-muted-foreground">
            Find answers or get in touch with our team
          </p>
          
          {/* Quick Contact */}
          <div className="flex flex-wrap gap-3 mt-4">
            <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full text-sm">
              <Mail className="w-4 h-4 text-primary" />
              <span>support@lervit.com</span>
            </div>
            <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full text-sm">
              <Phone className="w-4 h-4 text-primary" />
              <span>1-800-LERVIT</span>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-lg mx-auto bg-muted/50 p-1">
            <TabsTrigger value="faq" className="gap-2" data-testid="tab-faq">
              <Book className="w-4 h-4" />
              <span className="hidden sm:inline">FAQ</span>
            </TabsTrigger>
            <TabsTrigger value="contact" className="gap-2" data-testid="tab-contact">
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Contact</span>
            </TabsTrigger>
            <TabsTrigger value="tickets" className="gap-2 relative" data-testid="tab-my-tickets" disabled={!user}>
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">My Tickets</span>
              {/* Red notification badge */}
              {unreadCount > 0 && (
                <span 
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1"
                  data-testid="badge-unread-count"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="faq" className="space-y-6">
            {/* Search */}
            <div className="relative max-w-xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search for questions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 text-base bg-card"
                data-testid="input-faq-search"
              />
            </div>

            {/* FAQ Categories */}
            <div className="space-y-6">
              {filteredFaq.map((category, idx) => (
                <Card key={idx} className="overflow-hidden">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${category.bgColor} flex items-center justify-center`}>
                        <category.icon className={`w-5 h-5 ${category.color}`} />
                      </div>
                      <CardTitle className="text-lg">{category.category}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Accordion type="single" collapsible className="space-y-2">
                      {category.questions.map((item, qIdx) => (
                        <AccordionItem key={qIdx} value={`${idx}-${qIdx}`} className="border rounded-lg px-4">
                          <AccordionTrigger className="text-left hover:no-underline py-4" data-testid={`accordion-faq-${idx}-${qIdx}`}>
                            <span className="font-medium pr-4">{item.q}</span>
                          </AccordionTrigger>
                          <AccordionContent className="text-muted-foreground pb-4">
                            {item.a}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              ))}

              {filteredFaq.length === 0 && (
                <Card className="border-dashed">
                  <CardContent className="pt-12 pb-12 text-center">
                    <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">No results found</h3>
                    <p className="text-muted-foreground">
                      No FAQs match "{searchQuery}". Try different keywords or contact support.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="contact" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Send className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Create Support Ticket</CardTitle>
                    <CardDescription>
                      {user 
                        ? "Describe your issue and we'll respond within 24 hours"
                        : "Please log in to create a support ticket"
                      }
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {user ? (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                      <FormField
                        control={form.control}
                        name="subject"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Subject</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Brief description of your issue" 
                                className="h-11"
                                {...field} 
                                data-testid="input-ticket-subject"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="category"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Category</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-11" data-testid="select-ticket-category">
                                    <SelectValue placeholder="Select category" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="general">General Inquiry</SelectItem>
                                  <SelectItem value="booking">Booking Issue</SelectItem>
                                  <SelectItem value="billing">Billing & Payment</SelectItem>
                                  <SelectItem value="technical">Technical Problem</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="priority"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Priority</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-11" data-testid="select-ticket-priority">
                                    <SelectValue placeholder="Select priority" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="low">Low - General question</SelectItem>
                                  <SelectItem value="normal">Normal - Need help soon</SelectItem>
                                  <SelectItem value="high">High - Urgent issue</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="message"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Message</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Please describe your issue in detail. Include any relevant booking IDs, dates, or screenshots if applicable..."
                                className="min-h-32 resize-none"
                                {...field}
                                data-testid="textarea-ticket-message"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button 
                        type="submit" 
                        size="lg"
                        className="w-full"
                        disabled={createTicketMutation.isPending}
                        data-testid="button-submit-ticket"
                      >
                        {createTicketMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Creating Ticket...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Submit Ticket
                          </>
                        )}
                      </Button>
                    </form>
                  </Form>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                      <HelpCircle className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground mb-4">
                      You need to be logged in to create a support ticket
                    </p>
                    <Button asChild data-testid="button-login-to-support">
                      <a href="/login">
                        Log In to Continue
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </a>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tickets" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <HelpCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>My Support Tickets</CardTitle>
                    <CardDescription>
                      View and track your support requests
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {myTickets && myTickets.length > 0 ? (
                  <div className="space-y-3">
                    {myTickets.map((ticket) => (
                      <Dialog key={ticket.id}>
                        <DialogTrigger asChild>
                          <Card 
                            className="hover-elevate cursor-pointer"
                            onClick={() => {
                              setSelectedTicket(ticket);
                              setReplyMessage("");
                              // Mark the ticket as read when opened
                              markAsReadMutation.mutate(ticket.id);
                            }}
                            data-testid={`card-ticket-${ticket.id}`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h3 className="font-semibold truncate" data-testid={`text-ticket-subject-${ticket.id}`}>
                                      {ticket.subject}
                                    </h3>
                                    {/* Show NEW badge if ticket has unread staff replies */}
                                    {ticket.lastStaffReplyAt && (!ticket.customerLastReadAt || new Date(ticket.lastStaffReplyAt) > new Date(ticket.customerLastReadAt)) && (
                                      <Badge className="bg-red-500 text-white shrink-0 animate-pulse" data-testid={`badge-new-${ticket.id}`}>
                                        NEW
                                      </Badge>
                                    )}
                                    <Badge className={`${getStatusColor(ticket.status)} flex items-center gap-1 shrink-0`}>
                                      {getStatusIcon(ticket.status)}
                                      <span className="capitalize">{ticket.status.replace('_', ' ')}</span>
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                    {ticket.message}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <Badge variant="outline" className="capitalize">
                                      {ticket.category}
                                    </Badge>
                                    <Badge variant="outline" className="capitalize">
                                      {ticket.priority}
                                    </Badge>
                                    <span>Created {new Date(ticket.createdAt).toLocaleDateString()}</span>
                                  </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                              </div>
                            </CardContent>
                          </Card>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <MessageSquare className="w-5 h-5 text-primary" />
                              {ticket.subject}
                            </DialogTitle>
                            <DialogDescription>
                              Ticket #{ticket.id.slice(0, 8)} • Created {new Date(ticket.createdAt).toLocaleDateString()}
                            </DialogDescription>
                          </DialogHeader>
                          
                          <div className="flex flex-wrap gap-2">
                            <Badge className={`${getStatusColor(ticket.status)} capitalize`}>
                              {getStatusIcon(ticket.status)}
                              <span className="ml-1">{ticket.status.replace('_', ' ')}</span>
                            </Badge>
                            <Badge variant="outline" className="capitalize">{ticket.category}</Badge>
                            <Badge variant="outline" className="capitalize">{ticket.priority}</Badge>
                          </div>

                          <div className="max-h-[40vh] overflow-y-auto border rounded-lg p-1">
                            <div className="space-y-4 p-3">
                              {/* Original Message */}
                              <div className="bg-muted/50 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    <User className="w-4 h-4 text-primary" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">You</p>
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(ticket.createdAt).toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                                <p className="text-sm">{ticket.message}</p>
                              </div>

                              {/* Replies */}
                              {isLoadingDetails ? (
                                <div className="text-center py-4">
                                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                                  <p className="text-sm text-muted-foreground mt-2">Loading conversation...</p>
                                </div>
                              ) : ticketDetails?.replies && ticketDetails.replies.length > 0 ? (
                                ticketDetails.replies.map((reply) => (
                                  <div 
                                    key={reply.id} 
                                    className={`rounded-lg p-4 ${
                                      reply.isStaff 
                                        ? "bg-primary/5 border border-primary/20" 
                                        : "bg-muted/50"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                        reply.isStaff 
                                          ? "bg-primary/20" 
                                          : "bg-muted"
                                      }`}>
                                        {reply.isStaff ? (
                                          <Headphones className="w-4 h-4 text-primary" />
                                        ) : (
                                          <User className="w-4 h-4 text-muted-foreground" />
                                        )}
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium">
                                          {reply.isStaff ? "LervIT Support" : "You"}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {new Date(reply.createdAt).toLocaleString()}
                                        </p>
                                      </div>
                                    </div>
                                    <p className="text-sm">{reply.message}</p>
                                  </div>
                                ))
                              ) : (
                                <div className="text-center py-4 text-muted-foreground">
                                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                  <p className="text-sm">Awaiting response from support team</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Reply Form */}
                          {ticket.status !== "resolved" && (
                            <div className="border-t pt-4">
                              <div className="flex gap-2">
                                <Textarea
                                  placeholder="Type your reply..."
                                  value={replyMessage}
                                  onChange={(e) => setReplyMessage(e.target.value)}
                                  className="flex-1 min-h-[80px]"
                                  data-testid="textarea-customer-reply"
                                />
                              </div>
                              <Button
                                className="w-full mt-2"
                                disabled={!replyMessage.trim() || replyMutation.isPending}
                                onClick={() => {
                                  if (replyMessage.trim()) {
                                    replyMutation.mutate({ ticketId: ticket.id, message: replyMessage.trim() });
                                  }
                                }}
                                data-testid="button-send-reply"
                              >
                                {replyMutation.isPending ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Sending...
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-4 h-4 mr-2" />
                                    Send Reply
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No tickets yet</h3>
                    <p className="text-muted-foreground mb-4">
                      You haven't created any support tickets yet
                    </p>
                    <Button 
                      variant="outline" 
                      onClick={() => setActiveTab("contact")}
                      data-testid="button-create-first-ticket"
                    >
                      Create Your First Ticket
                    </Button>
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

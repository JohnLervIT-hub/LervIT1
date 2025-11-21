import { useState } from "react";
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
  Search
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { SupportTicket } from "@shared/schema";

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
      // Get auth headers
      const storedUser = localStorage.getItem("moveit_user");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          if (userData.id) {
            headers["Authorization"] = `Bearer ${userData.id}`;
          }
        } catch (e) {
          // Invalid stored user
        }
      }
      
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers,
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

  const onSubmit = (data: TicketFormData) => {
    createTicketMutation.mutate(data);
  };

  const faqData = [
    {
      category: "Getting Started",
      icon: Book,
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
      category: "Movers & Proximity Matching",
      icon: MapPin,
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
      icon: HelpCircle,
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
      case "open":
        return <Clock className="w-4 h-4" />;
      case "in_progress":
        return <AlertCircle className="w-4 h-4" />;
      case "resolved":
      case "closed":
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return <HelpCircle className="w-4 h-4" />;
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

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold mb-2" data-testid="text-support-title">
          Support & Help Center
        </h1>
        <p className="text-muted-foreground text-lg">
          Get answers to your questions or contact our support team
        </p>
      </div>

      <Tabs defaultValue="faq" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto">
          <TabsTrigger value="faq" data-testid="tab-faq">
            <Book className="w-4 h-4 mr-2" />
            FAQ
          </TabsTrigger>
          <TabsTrigger value="contact" data-testid="tab-contact">
            <MessageSquare className="w-4 h-4 mr-2" />
            Contact Support
          </TabsTrigger>
          <TabsTrigger value="tickets" data-testid="tab-my-tickets" disabled={!user}>
            <HelpCircle className="w-4 h-4 mr-2" />
            My Tickets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="faq" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Search FAQs
              </CardTitle>
              <CardDescription>
                Find quick answers to common questions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Search for questions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mb-6"
                data-testid="input-faq-search"
              />

              <div className="space-y-6">
                {filteredFaq.map((category, idx) => (
                  <div key={idx}>
                    <div className="flex items-center gap-2 mb-3">
                      <category.icon className="w-5 h-5 text-primary" />
                      <h3 className="text-lg font-semibold">{category.category}</h3>
                    </div>
                    <Accordion type="single" collapsible>
                      {category.questions.map((item, qIdx) => (
                        <AccordionItem key={qIdx} value={`${idx}-${qIdx}`}>
                          <AccordionTrigger data-testid={`accordion-faq-${idx}-${qIdx}`}>
                            {item.q}
                          </AccordionTrigger>
                          <AccordionContent className="text-muted-foreground">
                            {item.a}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                ))}

                {filteredFaq.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No FAQs found matching "{searchQuery}"</p>
                    <p className="text-sm mt-2">Try different keywords or contact support</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contact" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Create Support Ticket</CardTitle>
              <CardDescription>
                {user 
                  ? "Describe your issue and we'll get back to you as soon as possible"
                  : "Please log in to create a support ticket"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user ? (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subject</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Brief description of your issue" 
                              {...field} 
                              data-testid="input-ticket-subject"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Category</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-ticket-category">
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="general">General</SelectItem>
                                <SelectItem value="booking">Booking</SelectItem>
                                <SelectItem value="billing">Billing</SelectItem>
                                <SelectItem value="technical">Technical</SelectItem>
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
                                <SelectTrigger data-testid="select-ticket-priority">
                                  <SelectValue placeholder="Select priority" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="low">Low</SelectItem>
                                <SelectItem value="normal">Normal</SelectItem>
                                <SelectItem value="high">High</SelectItem>
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
                              placeholder="Provide detailed information about your issue..."
                              className="min-h-32"
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
                      className="w-full"
                      disabled={createTicketMutation.isPending}
                      data-testid="button-submit-ticket"
                    >
                      {createTicketMutation.isPending ? "Creating..." : "Create Ticket"}
                    </Button>
                  </form>
                </Form>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    You need to be logged in to create a support ticket
                  </p>
                  <Button asChild data-testid="button-login-to-support">
                    <a href="/login">Log In</a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tickets" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>My Support Tickets</CardTitle>
              <CardDescription>
                View and track your support requests
              </CardDescription>
            </CardHeader>
            <CardContent>
              {myTickets && myTickets.length > 0 ? (
                <div className="space-y-3">
                  {myTickets.map((ticket) => (
                    <Card key={ticket.id} className="hover-elevate">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <CardTitle className="text-lg mb-1" data-testid={`text-ticket-subject-${ticket.id}`}>
                              {ticket.subject}
                            </CardTitle>
                            <CardDescription className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="capitalize">
                                {ticket.category}
                              </Badge>
                              <Badge variant="outline" className="capitalize">
                                {ticket.priority}
                              </Badge>
                              <span className="text-xs">
                                Created {new Date(ticket.createdAt).toLocaleDateString()}
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
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <HelpCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>You haven't created any support tickets yet</p>
                  <p className="text-sm mt-2">Click the "Contact Support" tab to get help</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

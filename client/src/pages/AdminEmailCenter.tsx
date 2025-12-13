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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mail,
  Send,
  Users,
  UserCheck,
  Truck,
  Clock,
  CheckCircle2,
  AlertCircle,
  Megaphone,
  Newspaper,
  Tag,
  Calendar,
  MessageCircle,
  History,
  Search,
  Loader2,
} from "lucide-react";
import type { EmailCampaign, User } from "@shared/schema";
import { format } from "date-fns";

type Recipient = Pick<User, "id" | "name" | "email" | "role">;

const EMAIL_TYPES = [
  { value: "account_update", label: "Account Update", icon: UserCheck, color: "bg-blue-500" },
  { value: "news", label: "News", icon: Newspaper, color: "bg-purple-500" },
  { value: "promotion", label: "Promotion", icon: Tag, color: "bg-amber-500" },
  { value: "event", label: "Event", icon: Calendar, color: "bg-green-500" },
  { value: "personal", label: "Personal", icon: MessageCircle, color: "bg-indigo-500" },
];

const AUDIENCE_TYPES = [
  { value: "all", label: "All Users", icon: Users, description: "Send to all customers and movers" },
  { value: "customers", label: "Customers Only", icon: UserCheck, description: "Send to customers only" },
  { value: "movers", label: "Movers Only", icon: Truck, description: "Send to movers only" },
  { value: "specific", label: "Select Recipients", icon: Mail, description: "Choose specific users" },
];

const EMAIL_TEMPLATES = [
  {
    name: "Welcome Announcement",
    subject: "Welcome to LervIT - Your Moving Partner",
    content: "We're excited to have you join LervIT! Whether you're moving across town or need help with a delivery, our trusted movers are here to help.\n\nHere's what you can do:\n- Request a move in minutes\n- Get matched with verified movers\n- Track your move in real-time\n\nGet started today!",
    type: "news",
  },
  {
    name: "Special Promotion",
    subject: "Limited Time Offer - 15% Off Your Next Move!",
    content: "For a limited time, enjoy 15% off your next booking with LervIT!\n\nUse code: SAVE15 at checkout.\n\nTerms apply. Offer valid for moves booked within the next 7 days.",
    type: "promotion",
  },
  {
    name: "New Feature Announcement",
    subject: "New Feature: Real-Time Move Tracking",
    content: "We're excited to announce our latest feature - Real-Time Move Tracking!\n\nNow you can:\n- Track your mover's location live\n- Get accurate ETAs\n- Receive instant updates\n\nTry it on your next booking!",
    type: "news",
  },
  {
    name: "Account Security Update",
    subject: "Important: Security Update to Your Account",
    content: "We've made some security improvements to better protect your account.\n\nPlease ensure your contact information is up to date in your profile settings.\n\nIf you notice any suspicious activity, please contact our support team immediately.",
    type: "account_update",
  },
];

export default function AdminEmailCenter() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("compose");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [emailType, setEmailType] = useState<string>("");
  const [audienceType, setAudienceType] = useState<string>("");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: campaigns, isLoading: campaignsLoading } = useQuery<EmailCampaign[]>({
    queryKey: ["/api/admin/email/campaigns"],
  });

  const { data: recipients, isLoading: recipientsLoading } = useQuery<Recipient[]>({
    queryKey: ["/api/admin/email/recipients?audienceType=all"],
    enabled: audienceType === "specific",
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (data: {
      subject: string;
      content: string;
      type: string;
      audienceType: string;
      recipientIds?: string[];
    }) => {
      return apiRequest("POST", "/api/admin/email/send", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email/campaigns"] });
      toast({
        title: "Email Sent Successfully",
        description: "Your email campaign has been sent to the selected recipients.",
      });
      setSubject("");
      setContent("");
      setEmailType("");
      setAudienceType("");
      setSelectedRecipients([]);
      setActiveTab("history");
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to Send Email",
        description: error.message || "There was an error sending your email campaign.",
      });
    },
  });

  const handleSendEmail = () => {
    if (!subject.trim()) {
      toast({ variant: "destructive", title: "Missing Subject", description: "Please enter an email subject." });
      return;
    }
    if (!content.trim()) {
      toast({ variant: "destructive", title: "Missing Content", description: "Please enter email content." });
      return;
    }
    if (!emailType) {
      toast({ variant: "destructive", title: "Missing Type", description: "Please select an email type." });
      return;
    }
    if (!audienceType) {
      toast({ variant: "destructive", title: "Missing Audience", description: "Please select an audience." });
      return;
    }
    if (audienceType === "specific" && selectedRecipients.length === 0) {
      toast({ variant: "destructive", title: "No Recipients", description: "Please select at least one recipient." });
      return;
    }

    sendEmailMutation.mutate({
      subject,
      content,
      type: emailType,
      audienceType,
      recipientIds: audienceType === "specific" ? selectedRecipients : undefined,
    });
  };

  const handleTemplateSelect = (template: typeof EMAIL_TEMPLATES[0]) => {
    setSubject(template.subject);
    setContent(template.content);
    setEmailType(template.type);
    toast({
      title: "Template Applied",
      description: `"${template.name}" template has been loaded.`,
    });
  };

  const toggleRecipient = (userId: string) => {
    setSelectedRecipients(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const selectAllRecipients = () => {
    if (recipients) {
      const filteredRecipients = recipients.filter(r =>
        r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSelectedRecipients(filteredRecipients.map(r => r.id));
    }
  };

  const clearAllRecipients = () => {
    setSelectedRecipients([]);
  };

  const filteredRecipients = recipients?.filter(r =>
    r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTypeInfo = (type: string) => EMAIL_TYPES.find(t => t.value === type);
  const getAudienceInfo = (audience: string) => AUDIENCE_TYPES.find(a => a.value === audience);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge variant="secondary" className="bg-green-500/10 text-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Sent</Badge>;
      case "sending":
        return <Badge variant="secondary" className="bg-blue-500/10 text-blue-600"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Sending</Badge>;
      case "failed":
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Draft</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl">
      <div className="flex flex-col gap-2 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Email Center</h1>
            <p className="text-muted-foreground text-sm">Send bulk or personal emails to users</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="compose" data-testid="tab-compose">
            <Send className="w-4 h-4 mr-2" />
            Compose
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">
            <Megaphone className="w-4 h-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="w-4 h-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Compose Email</CardTitle>
                  <CardDescription>Create and send emails to your users</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email-type">Email Type</Label>
                      <Select value={emailType} onValueChange={setEmailType}>
                        <SelectTrigger id="email-type" data-testid="select-email-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {EMAIL_TYPES.map(type => (
                            <SelectItem key={type.value} value={type.value}>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${type.color}`} />
                                {type.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="audience-type">Audience</Label>
                      <Select value={audienceType} onValueChange={(value) => {
                        setAudienceType(value);
                        setSelectedRecipients([]);
                      }}>
                        <SelectTrigger id="audience-type" data-testid="select-audience">
                          <SelectValue placeholder="Select audience" />
                        </SelectTrigger>
                        <SelectContent>
                          {AUDIENCE_TYPES.map(audience => (
                            <SelectItem key={audience.value} value={audience.value}>
                              <div className="flex items-center gap-2">
                                <audience.icon className="w-4 h-4" />
                                {audience.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject Line</Label>
                    <Input
                      id="subject"
                      placeholder="Enter email subject..."
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      data-testid="input-subject"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="content">Email Content</Label>
                    <Textarea
                      id="content"
                      placeholder="Write your email content here..."
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="min-h-[200px]"
                      data-testid="input-content"
                    />
                    <p className="text-xs text-muted-foreground">
                      Plain text will be formatted with your email type's styling.
                    </p>
                  </div>

                  <Button
                    onClick={handleSendEmail}
                    disabled={sendEmailMutation.isPending}
                    className="w-full"
                    data-testid="button-send-email"
                  >
                    {sendEmailMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Email
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              {audienceType === "specific" && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span>Select Recipients</span>
                      <Badge variant="secondary">{selectedRecipients.length} selected</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                        data-testid="input-search-recipients"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={selectAllRecipients} data-testid="button-select-all">
                        Select All
                      </Button>
                      <Button size="sm" variant="outline" onClick={clearAllRecipients} data-testid="button-clear-all">
                        Clear
                      </Button>
                    </div>
                    <ScrollArea className="h-[300px]">
                      {recipientsLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                      ) : filteredRecipients?.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No users found</p>
                      ) : (
                        <div className="space-y-2">
                          {filteredRecipients?.map(recipient => (
                            <div
                              key={recipient.id}
                              className="flex items-center gap-3 p-2 rounded-lg border hover-elevate cursor-pointer"
                              onClick={() => toggleRecipient(recipient.id)}
                              data-testid={`recipient-${recipient.id}`}
                            >
                              <Checkbox
                                checked={selectedRecipients.includes(recipient.id)}
                                onCheckedChange={() => toggleRecipient(recipient.id)}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{recipient.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{recipient.email}</p>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {recipient.role}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {audienceType && audienceType !== "specific" && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Audience Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const info = getAudienceInfo(audienceType);
                      if (!info) return null;
                      return (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                          <info.icon className="w-5 h-5 mt-0.5 text-primary" />
                          <div>
                            <p className="font-medium">{info.label}</p>
                            <p className="text-sm text-muted-foreground">{info.description}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Email Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  {emailType ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const info = getTypeInfo(emailType);
                          if (!info) return null;
                          return (
                            <>
                              <div className={`w-3 h-3 rounded-full ${info.color}`} />
                              <span className="text-sm font-medium">{info.label}</span>
                            </>
                          );
                        })()}
                      </div>
                      {subject && (
                        <div>
                          <p className="text-xs text-muted-foreground">Subject</p>
                          <p className="font-medium">{subject}</p>
                        </div>
                      )}
                      {content && (
                        <div>
                          <p className="text-xs text-muted-foreground">Preview</p>
                          <p className="text-sm text-muted-foreground line-clamp-3">{content}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Select an email type to preview</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Email Templates</CardTitle>
              <CardDescription>Quick-start templates for common email campaigns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                {EMAIL_TEMPLATES.map((template, index) => {
                  const typeInfo = getTypeInfo(template.type);
                  return (
                    <Card key={index} className="hover-elevate cursor-pointer" onClick={() => handleTemplateSelect(template)}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          {typeInfo && (
                            <Badge variant="secondary" className={`${typeInfo.color} text-white`}>
                              {typeInfo.label}
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-xs">{template.subject}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-2">{template.content}</p>
                        <Button variant="outline" size="sm" className="mt-3 w-full" data-testid={`button-use-template-${index}`}>
                          Use Template
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Campaign History</CardTitle>
              <CardDescription>View all sent email campaigns</CardDescription>
            </CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : !campaigns || campaigns.length === 0 ? (
                <div className="text-center py-8">
                  <Mail className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No email campaigns sent yet</p>
                  <Button variant="outline" className="mt-4" onClick={() => setActiveTab("compose")}>
                    Send Your First Email
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {campaigns.map(campaign => {
                    const typeInfo = getTypeInfo(campaign.type);
                    const audienceInfo = getAudienceInfo(campaign.audienceType);
                    return (
                      <div
                        key={campaign.id}
                        className="flex items-start gap-4 p-4 rounded-lg border"
                        data-testid={`campaign-${campaign.id}`}
                      >
                        <div className={`p-2 rounded-lg ${typeInfo?.color || "bg-gray-500"}`}>
                          {typeInfo ? <typeInfo.icon className="w-4 h-4 text-white" /> : <Mail className="w-4 h-4 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium truncate">{campaign.subject}</p>
                            {getStatusBadge(campaign.status)}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                            {campaign.content}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              {audienceInfo && <audienceInfo.icon className="w-3 h-3" />}
                              {audienceInfo?.label || campaign.audienceType}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {campaign.recipientCount} recipients
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {campaign.sentAt ? format(new Date(campaign.sentAt), "MMM d, yyyy h:mm a") : "Not sent"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

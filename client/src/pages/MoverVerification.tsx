import { useQuery, useMutation } from "@tanstack/react-query";
import { openTel } from "@/lib/native";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Upload, CheckCircle, XCircle, Clock, AlertTriangle, FileText, Shield, User, Car, DollarSign, HelpCircle, Phone, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

type VerificationItem = {
  id: string;
  moverId: string;
  type: string;
  status: string;
  data: string | null;
  fileUrls: string[] | null;
  rejectionReason: string | null;
  expiryDate: string | null;
  submittedAt: string | null;
  updatedAt: string;
};

type VerificationStatus = {
  isComplete: boolean;
  requiredItems: string[];
  missingItems: string[];
  incompleteItems: { type: string; status: string; reason?: string }[];
  canGoOnline: boolean;
};

const VERIFICATION_SECTIONS = [
  {
    id: 'identity',
    title: 'Identity Verification',
    icon: User,
    items: [
      {
        type: 'ID',
        label: 'Government ID + Selfie',
        description: 'Upload a clear photo of your government-issued ID and a selfie',
        required: true,
        fields: [
          { name: 'fullName', label: 'Full Name', type: 'text' },
          { name: 'idNumber', label: 'ID Number', type: 'text' },
          { name: 'expiryDate', label: 'Expiry Date', type: 'date' },
        ],
      },
      {
        type: 'DRIVERS_LICENSE',
        label: "Driver's License",
        description: 'Upload both sides of your valid driver\'s license',
        required: true,
        fields: [
          { name: 'licenseNumber', label: 'License Number', type: 'text' },
          { name: 'province', label: 'Province', type: 'text' },
          { name: 'expiryDate', label: 'Expiry Date', type: 'date' },
        ],
      },
      {
        type: 'BACKGROUND_CHECK',
        label: 'Background Check',
        description: 'Upload a recent criminal record check (within last 6 months)',
        required: true,
        fields: [
          { name: 'checkDate', label: 'Check Date', type: 'date' },
          { name: 'referenceNumber', label: 'Reference Number (optional)', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'vehicle',
    title: 'Vehicle & Safety',
    icon: Car,
    items: [
      {
        type: 'VEHICLE_REGISTRATION',
        label: 'Vehicle Registration',
        description: 'Upload your vehicle registration document',
        required: true,
        fields: [
          { name: 'plateNumber', label: 'License Plate', type: 'text' },
          { name: 'vin', label: 'VIN (optional)', type: 'text' },
        ],
      },
      {
        type: 'VEHICLE_PHOTOS',
        label: 'Vehicle Photos',
        description: 'Upload photos of your vehicle (front, back, sides, cargo area)',
        required: true,
        fields: [],
      },
      {
        type: 'INSURANCE',
        label: 'Insurance Proof',
        description: 'Upload proof of vehicle insurance with commercial/delivery coverage',
        required: true,
        fields: [
          { name: 'policyNumber', label: 'Policy Number', type: 'text' },
          { name: 'insurerName', label: 'Insurance Company', type: 'text' },
          { name: 'effectiveDate', label: 'Effective Date', type: 'date' },
          { name: 'expiryDate', label: 'Expiry Date', type: 'date' },
        ],
      },
    ],
  },
  {
    id: 'earnings',
    title: 'Earnings Setup',
    icon: DollarSign,
    items: [
      {
        type: 'PAYOUT_SETUP',
        label: 'Bank/Payout Setup',
        description: 'Provide your banking information for payouts',
        required: true,
        fields: [
          { name: 'accountHolderName', label: 'Account Holder Name', type: 'text' },
          { name: 'bankName', label: 'Bank Name', type: 'text' },
          { name: 'transitNumber', label: 'Transit Number', type: 'text' },
          { name: 'institutionNumber', label: 'Institution Number', type: 'text' },
          { name: 'accountNumber', label: 'Account Number', type: 'text' },
        ],
      },
    ],
  },
];

const ALL_ITEMS = VERIFICATION_SECTIONS.flatMap(section => section.items);

function getStatusBadge(status: string) {
  const normalizedStatus = status.toLowerCase();
  
  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any; className?: string }> = {
    pending: { label: 'Pending', variant: 'secondary', icon: Clock },
    under_review: { label: 'Under Review', variant: 'default', icon: FileText },
    'under review': { label: 'Under Review', variant: 'default', icon: FileText },
    approved: { label: 'Approved', variant: 'default', icon: CheckCircle, className: 'bg-green-500 hover:bg-green-600 text-white' },
    rejected: { label: 'Rejected', variant: 'destructive', icon: XCircle },
    expired: { label: 'Expired', variant: 'destructive', icon: AlertTriangle },
    missing: { label: 'Not Submitted', variant: 'outline', icon: Upload },
  };

  const config = statusConfig[normalizedStatus] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={config.className} data-testid={`badge-status-${status}`}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
}

function UploadDocumentDialog({ 
  itemConfig, 
  existingItem, 
  moverId 
}: { 
  itemConfig: typeof ALL_ITEMS[0]; 
  existingItem?: VerificationItem;
  moverId: string;
}) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await fetch(`/api/movers/${moverId}/verification/${itemConfig.type}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: data,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/movers/${moverId}/verification`] });
      queryClient.invalidateQueries({ queryKey: [`/api/movers/${moverId}/verification-status`] });
      toast({
        title: "Document uploaded",
        description: "Your document has been submitted for review.",
      });
      setOpen(false);
      setFiles(null);
      setFormData({});
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = new FormData();
    
    if (files) {
      Array.from(files).forEach((file) => {
        data.append('files', file);
      });
    }
    
    data.append('data', JSON.stringify(formData));
    
    if (formData.expiryDate) {
      data.append('expiryDate', formData.expiryDate);
    }

    uploadMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant={existingItem ? "outline" : "default"}
          size="sm"
          data-testid={`button-upload-${itemConfig.type.toLowerCase()}`}
        >
          <Upload className="w-4 h-4 mr-2" />
          {existingItem ? 'Re-upload' : 'Upload'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{itemConfig.label}</DialogTitle>
          <DialogDescription>{itemConfig.description}</DialogDescription>
        </DialogHeader>

        {existingItem?.status?.toLowerCase() === 'rejected' && existingItem.rejectionReason && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Rejection Reason:</strong> {existingItem.rejectionReason}
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`file-${itemConfig.type}`}>
              Upload Files {itemConfig.type === 'VEHICLE_PHOTOS' ? '(Multiple allowed)' : ''}
            </Label>
            <Input
              id={`file-${itemConfig.type}`}
              type="file"
              accept="image/*,application/pdf"
              multiple={itemConfig.type === 'VEHICLE_PHOTOS'}
              onChange={(e) => setFiles(e.target.files)}
              data-testid={`input-file-${itemConfig.type.toLowerCase()}`}
              required={!existingItem}
            />
            <p className="text-sm text-muted-foreground">
              Accepted formats: JPG, PNG, PDF (max 10MB)
            </p>
          </div>

          {itemConfig.fields.map((field) => (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={field.name}>{field.label}</Label>
              <Input
                id={field.name}
                type={field.type}
                value={formData[field.name] || ''}
                onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                data-testid={`input-${field.name}`}
                required={!field.label.includes('optional')}
              />
            </div>
          ))}

          {existingItem?.fileUrls && existingItem.fileUrls.length > 0 && (
            <div className="space-y-2">
              <Label>Currently Uploaded Files</Label>
              <div className="flex flex-wrap gap-2">
                {existingItem.fileUrls.map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    File {idx + 1}
                  </a>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploadMutation.isPending} data-testid="button-submit-document">
              {uploadMutation.isPending ? 'Uploading...' : 'Submit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VerificationItemCard({ 
  itemConfig, 
  existingItem, 
  moverId 
}: { 
  itemConfig: typeof ALL_ITEMS[0]; 
  existingItem?: VerificationItem;
  moverId: string;
}) {
  const itemStatus = existingItem?.status || 'missing';
  const normalizedStatus = itemStatus.toLowerCase();
  const isApproved = normalizedStatus === 'approved';
  const isRejected = normalizedStatus === 'rejected';

  return (
    <div 
      data-testid={`card-verification-${itemConfig.type.toLowerCase()}`}
      className={`p-4 rounded-lg border transition-all ${
        isApproved 
          ? 'border-green-500/30 bg-green-500/5' 
          : isRejected 
            ? 'border-destructive/30 bg-destructive/5' 
            : 'border-border bg-card/50 hover:bg-card'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-sm">{itemConfig.label}</h4>
            {getStatusBadge(itemStatus)}
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{itemConfig.description}</p>
          
          {existingItem?.submittedAt && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Submitted {format(new Date(existingItem.submittedAt), 'MMM d, yyyy')}
            </p>
          )}
          
          {isRejected && existingItem?.rejectionReason && (
            <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
              {existingItem.rejectionReason}
            </div>
          )}
        </div>
        
        <UploadDocumentDialog
          itemConfig={itemConfig}
          existingItem={existingItem}
          moverId={moverId}
        />
      </div>
    </div>
  );
}

export default function MoverVerification() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: mover, isLoading: moverLoading } = useQuery<any>({
    queryKey: [`/api/movers?userId=${user?.id}`],
    enabled: !!user?.id,
    select: (data) => Array.isArray(data) ? data[0] : data,
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery<VerificationItem[]>({
    queryKey: [`/api/movers/${mover?.id}/verification`],
    enabled: !!mover?.id,
  });

  const { data: status } = useQuery<VerificationStatus>({
    queryKey: [`/api/movers/${mover?.id}/verification-status`],
    enabled: !!mover?.id,
  });

  if (moverLoading || itemsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading verification status...</div>
      </div>
    );
  }

  if (!mover) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Mover profile not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  const approvedCount = items.filter(item => item.status?.toLowerCase() === 'approved').length;
  const totalRequired = ALL_ITEMS.filter(item => item.required).length;
  const progressPercentage = (approvedCount / totalRequired) * 100;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content - Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              status?.isComplete 
                ? 'bg-green-500/20' 
                : 'bg-primary/10'
            }`}>
              <Shield className={`w-6 h-6 ${status?.isComplete ? 'text-green-500' : 'text-primary'}`} />
            </div>
            <div>
              <h1 className="text-xl font-bold">Verification & Compliance</h1>
              <p className="text-sm text-muted-foreground">
                Complete all requirements to start accepting jobs
              </p>
            </div>
          </div>

          {/* Verification Sections */}
          {VERIFICATION_SECTIONS.map((section) => {
            const SectionIcon = section.icon;
            const sectionApproved = section.items.filter(item => {
              const existingItem = items.find(i => i.type === item.type);
              return existingItem?.status?.toLowerCase() === 'approved';
            }).length;
            
            return (
              <Card key={section.id} className="overflow-hidden">
                <CardHeader className="pb-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <SectionIcon className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className="text-base">{section.title}</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {sectionApproved}/{section.items.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-3 space-y-2">
                  {section.items.map((itemConfig) => {
                    const existingItem = items.find(item => item.type === itemConfig.type);
                    return (
                      <VerificationItemCard
                        key={itemConfig.type}
                        itemConfig={itemConfig}
                        existingItem={existingItem}
                        moverId={mover.id}
                      />
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Sidebar - Right Column */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {/* Progress Card */}
          <Card className={status?.isComplete ? "border-green-500/30 bg-green-500/5" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {status?.isComplete ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <Clock className="w-5 h-5 text-muted-foreground" />
                )}
                Verification Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-semibold">{approvedCount}/{totalRequired}</span>
                </div>
                <Progress value={progressPercentage} className="h-2" data-testid="progress-verification" />
              </div>
              
              {status?.isComplete ? (
                <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                    All verified! You can now go online.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    {totalRequired - approvedCount} items remaining
                  </p>
                </div>
              )}

              {status?.isComplete && (
                <Button className="w-full" data-testid="button-go-online">
                  Go Online
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Help Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-muted-foreground" />
                Need Help?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Having trouble with your documents? Our support team is here to help.
              </p>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start" 
                  data-testid="button-chat-support"
                  onClick={() => navigate("/support")}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Chat with Support
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start" 
                  data-testid="button-call-support"
                  onClick={() => openTel('+18889820885')}
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Call 1-888-982-0885
                </Button>
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Need an RCMP background check?{" "}
                  <a 
                    href="https://www.rcmp-grc.gc.ca/en/criminal-record-checks" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Learn how to get one
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

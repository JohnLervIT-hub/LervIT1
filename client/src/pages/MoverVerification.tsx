import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Upload, CheckCircle, XCircle, Clock, AlertTriangle, FileText, Shield } from "lucide-react";
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

const VERIFICATION_ITEMS = [
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
];

function getStatusBadge(status: string) {
  // Normalize status to lowercase for comparison
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
  itemConfig: typeof VERIFICATION_ITEMS[0]; 
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

export default function MoverVerification() {
  const { user } = useAuth();

  const { data: mover } = useQuery<any>({
    queryKey: [`/api/movers?userId=${user?.id}`],
    enabled: !!user?.id,
    select: (data) => Array.isArray(data) ? data[0] : data,
  });

  const { data: items = [], isLoading } = useQuery<VerificationItem[]>({
    queryKey: [`/api/movers/${mover?.id}/verification`],
    enabled: !!mover?.id,
  });

  const { data: status } = useQuery<VerificationStatus>({
    queryKey: [`/api/movers/${mover?.id}/verification-status`],
    enabled: !!mover?.id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading verification status...</div>
      </div>
    );
  }

  if (!mover) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Mover profile not found</AlertDescription>
      </Alert>
    );
  }

  const approvedCount = items.filter(item => item.status?.toLowerCase() === 'approved').length;
  const totalRequired = VERIFICATION_ITEMS.filter(item => item.required).length;
  const progressPercentage = (approvedCount / totalRequired) * 100;

  return (
    <div className="space-y-6">
      {/* Premium Progress Header */}
      <Card className={status?.isComplete ? "bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20" : "bg-gradient-to-br from-primary/5 to-transparent"}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                status?.isComplete 
                  ? 'bg-green-500/20' 
                  : 'bg-primary/10'
              }`}>
                <Shield className={`w-7 h-7 ${status?.isComplete ? 'text-green-500' : 'text-primary'}`} />
              </div>
              <div>
                <h2 className="text-xl font-bold">Verification & Compliance</h2>
                <p className="text-muted-foreground text-sm">
                  {status?.isComplete 
                    ? 'All requirements complete - you can go online!' 
                    : 'Complete all requirements to start accepting jobs'}
                </p>
              </div>
            </div>
            {status?.isComplete && (
              <Badge variant="default" className="bg-green-500 hover:bg-green-600 px-3 py-1">
                <CheckCircle className="w-4 h-4 mr-1" />
                Verified
              </Badge>
            )}
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Verification Progress</span>
              <span className="font-semibold text-lg">{approvedCount}/{totalRequired}</span>
            </div>
            <div className="relative">
              <Progress value={progressPercentage} className="h-3" data-testid="progress-verification" />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{approvedCount} approved</span>
              <span>{totalRequired - approvedCount} remaining</span>
            </div>
          </div>

          {!status?.isComplete && (
            <div className="mt-4 bg-amber-500/10 rounded-xl p-4 flex items-center gap-3 border border-amber-500/20">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-sm text-muted-foreground">
                Complete all verification items to go online and start earning.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verification Items List */}
      <div className="space-y-3">
        <h3 className="font-semibold text-lg px-1">Required Documents</h3>
        {VERIFICATION_ITEMS.map((itemConfig, index) => {
          const existingItem = items.find(item => item.type === itemConfig.type);
          const itemStatus = existingItem?.status || 'missing';
          const normalizedStatus = itemStatus.toLowerCase();
          const isApproved = normalizedStatus === 'approved';
          const isRejected = normalizedStatus === 'rejected';

          return (
            <Card 
              key={itemConfig.type} 
              data-testid={`card-verification-${itemConfig.type.toLowerCase()}`}
              className={`transition-all hover-elevate ${
                isApproved 
                  ? 'border-green-500/30 bg-green-500/5' 
                  : isRejected 
                    ? 'border-destructive/30 bg-destructive/5' 
                    : ''
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Step Number / Status Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isApproved 
                      ? 'bg-green-500/20 text-green-500' 
                      : isRejected 
                        ? 'bg-destructive/20 text-destructive'
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {isApproved ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <span className="font-bold">{index + 1}</span>
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1">
                        <h4 className="font-semibold flex flex-wrap items-center gap-2">
                          {itemConfig.label}
                          {itemConfig.required && (
                            <Badge variant="outline" className="text-xs font-normal">Required</Badge>
                          )}
                        </h4>
                        <p className="text-sm text-muted-foreground mt-0.5">{itemConfig.description}</p>
                        
                        {existingItem && (
                          <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-xs text-muted-foreground">
                            {existingItem.submittedAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {format(new Date(existingItem.submittedAt), 'MMM d, yyyy')}
                              </span>
                            )}
                            {existingItem.expiryDate && (
                              <span>Expires: {format(new Date(existingItem.expiryDate), 'MMM d, yyyy')}</span>
                            )}
                          </div>
                        )}
                        
                        {existingItem?.status?.toLowerCase() === 'rejected' && existingItem.rejectionReason && (
                          <div className="mt-3 bg-destructive/10 rounded-lg p-3 border border-destructive/20">
                            <p className="text-sm text-destructive font-medium">Rejection Reason:</p>
                            <p className="text-sm text-muted-foreground mt-1">{existingItem.rejectionReason}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                        {getStatusBadge(itemStatus)}
                        <UploadDocumentDialog
                          itemConfig={itemConfig}
                          existingItem={existingItem}
                          moverId={mover.id}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

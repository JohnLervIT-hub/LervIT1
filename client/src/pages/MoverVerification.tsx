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
  
  const statusConfig = {
    pending: { label: 'Pending', variant: 'secondary' as const, icon: Clock },
    under_review: { label: 'Under Review', variant: 'default' as const, icon: FileText },
    'under review': { label: 'Under Review', variant: 'default' as const, icon: FileText },
    approved: { label: 'Approved', variant: 'default' as const, icon: CheckCircle, className: 'bg-green-500 hover:bg-green-600' },
    rejected: { label: 'Rejected', variant: 'destructive' as const, icon: XCircle },
    expired: { label: 'Expired', variant: 'destructive' as const, icon: AlertTriangle },
    missing: { label: 'Not Submitted', variant: 'outline' as const, icon: Upload },
  };

  const config = statusConfig[normalizedStatus as keyof typeof statusConfig] || statusConfig.pending;
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Verification & Compliance
              </CardTitle>
              <CardDescription>
                Complete all verification requirements to go online and accept jobs
              </CardDescription>
            </div>
            {status?.isComplete && (
              <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                <CheckCircle className="w-4 h-4 mr-1" />
                Fully Verified
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Verification Progress</span>
                <span className="font-medium">{approvedCount} of {totalRequired} approved</span>
              </div>
              <Progress value={progressPercentage} className="h-2" data-testid="progress-verification" />
            </div>

            {!status?.isComplete && status?.incompleteItems && status.incompleteItems.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  You must complete all verification items before you can go online to accept bookings.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {VERIFICATION_ITEMS.map((itemConfig) => {
          const existingItem = items.find(item => item.type === itemConfig.type);
          const itemStatus = existingItem?.status || 'missing';

          return (
            <Card key={itemConfig.type} data-testid={`card-verification-${itemConfig.type.toLowerCase()}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{itemConfig.label}</CardTitle>
                      {itemConfig.required && (
                        <Badge variant="outline" className="text-xs">Required</Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1">{itemConfig.description}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(itemStatus)}
                    <UploadDocumentDialog
                      itemConfig={itemConfig}
                      existingItem={existingItem}
                      moverId={mover.id}
                    />
                  </div>
                </div>
              </CardHeader>
              {existingItem && (
                <CardContent>
                  <div className="text-sm text-muted-foreground space-y-1">
                    {existingItem.submittedAt && (
                      <p>Submitted: {format(new Date(existingItem.submittedAt), 'PPp')}</p>
                    )}
                    {existingItem.expiryDate && (
                      <p>Expires: {format(new Date(existingItem.expiryDate), 'PP')}</p>
                    )}
                    {existingItem.status?.toLowerCase() === 'rejected' && existingItem.rejectionReason && (
                      <Alert variant="destructive" className="mt-2">
                        <AlertDescription>
                          <strong>Reason:</strong> {existingItem.rejectionReason}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

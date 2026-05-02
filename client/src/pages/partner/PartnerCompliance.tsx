import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  FileCheck,
  Upload,
  Trash2,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Loader2,
  FileText,
} from "lucide-react";
import { format } from "date-fns";

const DOC_TYPES = [
  { value: "insurance_certificate", label: "Insurance Certificate" },
  { value: "cargo_liability", label: "Cargo Liability Insurance" },
  { value: "business_registration", label: "Business Registration" },
  { value: "compliance_attestation", label: "Compliance Attestation" },
  { value: "vehicle_registration", label: "Vehicle Registration" },
  { value: "drivers_abstract", label: "Driver's Abstract" },
];

const REVIEW_STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  pending: { color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", icon: Clock, label: "Pending Review" },
  under_review: { color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", icon: Clock, label: "Under Review" },
  approved: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle, label: "Approved" },
  rejected: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle, label: "Rejected" },
};

const REQUIRED_DOC_TYPES = ["insurance_certificate", "cargo_liability", "business_registration"];

export default function PartnerCompliance() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [docType, setDocType] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: docs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/partner/compliance"],
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !docType) throw new Error("Select a file and document type");
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("docType", docType);
      if (expiryDate) fd.append("expiryDate", expiryDate);
      const res = await fetch("/api/partner/compliance/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document uploaded successfully" });
      setDocType("");
      setExpiryDate("");
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["/api/partner/compliance"] });
      qc.invalidateQueries({ queryKey: ["/api/partner/onboarding"] });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Upload failed", variant: "destructive" }),
  });

  const deleteDoc = useMutation({
    mutationFn: (id: string) => fetch(`/api/partner/compliance/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => {
      toast({ title: "Document removed" });
      qc.invalidateQueries({ queryKey: ["/api/partner/compliance"] });
    },
    onError: () => toast({ title: "Cannot delete this document", variant: "destructive" }),
  });

  const uploadedTypes = docs.map((d: any) => d.docType);
  const missingRequired = REQUIRED_DOC_TYPES.filter(t => !uploadedTypes.includes(t));

  return (
    <PartnerLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Compliance Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload required insurance certificates, business registration, and other compliance documents.
          </p>
        </div>

        {missingRequired.length > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Missing required documents: {missingRequired.map(t => DOC_TYPES.find(d => d.value === t)?.label).join(", ")}.
            </AlertDescription>
          </Alert>
        )}

        {/* Upload form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="w-4 h-4" /> Upload Document
            </CardTitle>
            <CardDescription>Accepted formats: PDF, PNG, JPG, DOCX — max 20MB</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Document Type *</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger data-testid="select-doc-type">
                    <SelectValue placeholder="Select type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Expiry Date (optional)</Label>
                <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} data-testid="input-expiry-date" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>File *</Label>
              <div
                className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover-elevate"
                onClick={() => fileRef.current?.click()}
                data-testid="dropzone-file"
              >
                <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                {selectedFile ? (
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Click to select file</p>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                className="hidden"
                onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                data-testid="input-file"
              />
            </div>
            <Button
              onClick={() => upload.mutate()}
              disabled={upload.isPending || !selectedFile || !docType}
              data-testid="button-upload"
            >
              {upload.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading…</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" />Upload Document</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Uploaded documents */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Uploaded Documents ({docs.length})</h2>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="h-20 rounded-md bg-muted animate-pulse" />)}
            </div>
          ) : docs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-10 gap-2">
                <FileCheck className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No documents uploaded yet</p>
              </CardContent>
            </Card>
          ) : (
            docs.map((doc: any) => {
              const cfg = REVIEW_STATUS_CONFIG[doc.reviewStatus] ?? REVIEW_STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              const typeLabel = DOC_TYPES.find(d => d.value === doc.docType)?.label ?? doc.docType;
              return (
                <Card key={doc.id} data-testid={`card-doc-${doc.id}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted shrink-0">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{typeLabel}</p>
                          <Badge className={`text-xs ${cfg.color}`} data-testid={`status-doc-${doc.id}`}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {cfg.label}
                          </Badge>
                          {REQUIRED_DOC_TYPES.includes(doc.docType) && (
                            <Badge variant="outline" className="text-xs">Required</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {doc.fileName ?? "Uploaded document"}
                          {doc.expiryDate && ` · Expires ${format(new Date(doc.expiryDate), "PP")}`}
                        </p>
                        {doc.reviewNotes && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{doc.reviewNotes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {doc.fileUrl && (
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost" data-testid={`button-view-doc-${doc.id}`}>View</Button>
                          </a>
                        )}
                        {doc.reviewStatus !== "approved" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteDoc.mutate(doc.id)}
                            disabled={deleteDoc.isPending}
                            data-testid={`button-delete-doc-${doc.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </PartnerLayout>
  );
}

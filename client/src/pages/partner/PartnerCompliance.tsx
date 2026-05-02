import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { FileCheck, Upload, Trash2, CheckCircle, Clock, XCircle, AlertCircle, Loader2, FileText } from "lucide-react";
import { format } from "date-fns";

const DOC_TYPES = [
  { value: "insurance_certificate", label: "Insurance Certificate" },
  { value: "cargo_liability", label: "Cargo Liability Insurance" },
  { value: "business_registration", label: "Business Registration" },
  { value: "compliance_attestation", label: "Compliance Attestation" },
  { value: "vehicle_registration", label: "Vehicle Registration" },
  { value: "drivers_abstract", label: "Driver's Abstract" },
];

const REQUIRED_DOC_TYPES = ["insurance_certificate", "cargo_liability", "business_registration"];

const REVIEW_STATUS: Record<string, { icon: React.ElementType; dot: string; label: string }> = {
  pending:      { icon: Clock,        dot: "bg-gray-400",   label: "Pending Review" },
  under_review: { icon: Clock,        dot: "bg-amber-500",  label: "Under Review" },
  approved:     { icon: CheckCircle,  dot: "bg-green-500",  label: "Approved" },
  rejected:     { icon: XCircle,      dot: "bg-red-500",    label: "Rejected" },
};

export default function PartnerCompliance() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: docs = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/partner/compliance"] });

  const upload = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !docType) throw new Error("Select a file and document type");
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("docType", docType);
      if (expiryDate) fd.append("expiryDate", expiryDate);
      const res = await fetch("/api/partner/compliance/upload", { method: "POST", credentials: "include", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document uploaded" });
      setDocType(""); setExpiryDate(""); setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["/api/partner/compliance"] });
      qc.invalidateQueries({ queryKey: ["/api/partner/onboarding"] });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Upload failed", variant: "destructive" }),
  });

  const deleteDoc = useMutation({
    mutationFn: (id: string) => fetch(`/api/partner/compliance/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => { toast({ title: "Document removed" }); qc.invalidateQueries({ queryKey: ["/api/partner/compliance"] }); },
    onError: () => toast({ title: "Cannot delete this document", variant: "destructive" }),
  });

  const uploadedTypes = docs.map((d: any) => d.docType);
  const missingRequired = REQUIRED_DOC_TYPES.filter(t => !uploadedTypes.includes(t));
  const allRequiredDone = missingRequired.length === 0;

  return (
    <PartnerLayout>
      <div className="p-6 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-xl font-semibold">Compliance Documents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload required certificates, registration, and compliance documents
          </p>
        </div>

        {/* Requirements */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Required Documents
              {allRequiredDone && (
                <span className="flex items-center gap-1 text-xs font-normal text-green-600 dark:text-green-400">
                  <CheckCircle className="w-3.5 h-3.5" /> Complete
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-px">
            {REQUIRED_DOC_TYPES.map((type, idx) => {
              const done = uploadedTypes.includes(type);
              const label = DOC_TYPES.find(d => d.value === type)?.label ?? type;
              const docEntry = docs.find((d: any) => d.docType === type);
              const cfg = docEntry ? (REVIEW_STATUS[docEntry.reviewStatus] ?? REVIEW_STATUS.pending) : null;
              return (
                <div key={type}>
                  <div className="flex items-center gap-3 py-2.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${done ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                    <span className={`text-sm flex-1 ${done ? "" : "text-muted-foreground"}`}>{label}</span>
                    {cfg ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not uploaded</span>
                    )}
                  </div>
                  {idx < REQUIRED_DOC_TYPES.length - 1 && <Separator className="opacity-40" />}
                </div>
              );
            })}
            {!allRequiredDone && (
              <p className="text-xs text-muted-foreground pt-3 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                {missingRequired.length} required document{missingRequired.length !== 1 ? "s" : ""} missing — account cannot be activated until uploaded
              </p>
            )}
          </CardContent>
        </Card>

        {/* Upload form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Upload Document</CardTitle>
            <p className="text-xs text-muted-foreground">PDF, PNG, JPG, DOCX — max 20MB</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Document Type</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger data-testid="select-doc-type">
                    <SelectValue placeholder="Select type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map(d => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                        {REQUIRED_DOC_TYPES.includes(d.value) && !uploadedTypes.includes(d.value) && (
                          <span className="text-muted-foreground ml-1">*</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Expiry Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} data-testid="input-expiry-date" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>File</Label>
              <div
                className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover-elevate"
                onClick={() => fileRef.current?.click()}
                data-testid="dropzone-file"
              >
                <FileText className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                {selectedFile ? (
                  <>
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Click to select a file</p>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" className="hidden" onChange={e => setSelectedFile(e.target.files?.[0] ?? null)} data-testid="input-file" />
            </div>

            <Button size="sm" onClick={() => upload.mutate()} disabled={upload.isPending || !selectedFile || !docType} data-testid="button-upload">
              {upload.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Uploading…</> : <><Upload className="w-3.5 h-3.5 mr-1.5" />Upload Document</>}
            </Button>
          </CardContent>
        </Card>

        {/* Uploaded documents */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Uploaded Documents</h2>
            <span className="text-xs text-muted-foreground">{docs.length} document{docs.length !== 1 ? "s" : ""}</span>
          </div>

          {isLoading ? (
            <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
              <FileCheck className="w-7 h-7" />
              <p className="text-sm">No documents uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-px rounded-md border">
              {docs.map((doc: any, idx: number) => {
                const cfg = REVIEW_STATUS[doc.reviewStatus] ?? REVIEW_STATUS.pending;
                const typeLabel = DOC_TYPES.find(d => d.value === doc.docType)?.label ?? doc.docType;
                return (
                  <div key={doc.id}>
                    <div className="flex items-center gap-3 px-4 py-3" data-testid={`card-doc-${doc.id}`}>
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{typeLabel}</p>
                          {REQUIRED_DOC_TYPES.includes(doc.docType) && (
                            <span className="text-xs text-muted-foreground">Required</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          <span data-testid={`status-doc-${doc.id}`}>{cfg.label}</span>
                          {doc.fileName && <span>{doc.fileName}</span>}
                          {doc.expiryDate && <span>Expires {format(new Date(doc.expiryDate), "PP")}</span>}
                        </div>
                        {doc.reviewNotes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{doc.reviewNotes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {doc.fileUrl && (
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" data-testid={`button-view-doc-${doc.id}`}>View</Button>
                          </a>
                        )}
                        {doc.reviewStatus !== "approved" && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteDoc.mutate(doc.id)} disabled={deleteDoc.isPending} data-testid={`button-delete-doc-${doc.id}`}>
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {idx < docs.length - 1 && <Separator className="opacity-40" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PartnerLayout>
  );
}

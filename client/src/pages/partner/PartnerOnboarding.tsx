import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import {
  CheckCircle,
  Circle,
  Building2,
  MapPin,
  FileText,
  Radio,
  Users,
  ScrollText,
  Clock,
  ChevronRight,
  Loader2,
  Upload,
  AlertCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const STEP_ICONS: Record<string, React.ElementType> = {
  profile: Building2,
  coverage: MapPin,
  compliance: FileText,
  dispatch: Radio,
  team: Users,
  terms: ScrollText,
  review: Clock,
};

function StepCard({
  step,
  index,
  onAction,
}: {
  step: any;
  index: number;
  onAction: (key: string) => void;
}) {
  const Icon = STEP_ICONS[step.key] ?? Circle;
  return (
    <Card
      className={step.complete ? "border-green-200 dark:border-green-800" : ""}
      data-testid={`card-step-${step.key}`}
    >
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-4">
          <div
            className={`flex items-center justify-center w-10 h-10 rounded-md shrink-0 ${
              step.complete
                ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {step.complete ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{step.label}</span>
              {step.complete ? (
                <Badge variant="secondary" className="text-xs h-5">Complete</Badge>
              ) : (
                <Badge variant="outline" className="text-xs h-5 text-muted-foreground">Pending</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
          </div>
          {step.key !== "review" && (
            <Button
              size="sm"
              variant={step.complete ? "outline" : "default"}
              onClick={() => onAction(step.key)}
              data-testid={`button-step-${step.key}`}
            >
              {step.complete ? "Edit" : "Complete"}
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileForm({ partner, onSave }: { partner: any; onSave: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: partner?.name ?? "",
    legalName: partner?.legalName ?? "",
    billingEmail: partner?.billingEmail ?? "",
    primaryOpsContact: partner?.primaryOpsContact ?? "",
    dispatchContact: partner?.dispatchContact ?? "",
    escalationContact: partner?.escalationContact ?? "",
    address: partner?.address ?? "",
    phone: partner?.phone ?? "",
    serviceDescription: partner?.serviceDescription ?? "",
  });

  const save = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/partner/profile", form),
    onSuccess: () => {
      toast({ title: "Profile saved" });
      qc.invalidateQueries({ queryKey: ["/api/partner/onboarding"] });
      qc.invalidateQueries({ queryKey: ["/api/partner/me"] });
      onSave();
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Operating Name *</Label>
          <Input data-testid="input-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Legal Name *</Label>
          <Input data-testid="input-legal-name" value={form.legalName} onChange={e => setForm(f => ({ ...f, legalName: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Billing Email *</Label>
          <Input type="email" data-testid="input-billing-email" value={form.billingEmail} onChange={e => setForm(f => ({ ...f, billingEmail: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input data-testid="input-phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Primary Ops Contact *</Label>
          <Input placeholder="Name & phone" data-testid="input-ops-contact" value={form.primaryOpsContact} onChange={e => setForm(f => ({ ...f, primaryOpsContact: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Dispatch Contact</Label>
          <Input placeholder="Name & phone" data-testid="input-dispatch-contact" value={form.dispatchContact} onChange={e => setForm(f => ({ ...f, dispatchContact: e.target.value }))} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Business Address *</Label>
          <Input data-testid="input-address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Service Description</Label>
          <Textarea rows={3} placeholder="Briefly describe your moving services…" data-testid="input-service-description" value={form.serviceDescription} onChange={e => setForm(f => ({ ...f, serviceDescription: e.target.value }))} />
        </div>
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-profile">
        {save.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save Profile"}
      </Button>
    </div>
  );
}

function CoverageForm({ onSave }: { onSave: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: zones = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/partner/coverage"] });
  const [form, setForm] = useState({ zoneName: "", city: "", province: "", serviceRadiusKm: "" });

  const addZone = useMutation({
    mutationFn: () => apiRequest("POST", "/api/partner/coverage", { ...form, serviceRadiusKm: form.serviceRadiusKm ? parseInt(form.serviceRadiusKm) : null }),
    onSuccess: () => {
      toast({ title: "Zone added" });
      setForm({ zoneName: "", city: "", province: "", serviceRadiusKm: "" });
      qc.invalidateQueries({ queryKey: ["/api/partner/coverage"] });
      qc.invalidateQueries({ queryKey: ["/api/partner/onboarding"] });
      onSave();
    },
    onError: () => toast({ title: "Failed to add zone", variant: "destructive" }),
  });

  const deleteZone = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/partner/coverage/${id}`),
    onSuccess: () => {
      toast({ title: "Zone removed" });
      qc.invalidateQueries({ queryKey: ["/api/partner/coverage"] });
    },
    onError: () => toast({ title: "Failed to remove zone", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Zone Name *</Label>
          <Input placeholder="e.g. Downtown Toronto" data-testid="input-zone-name" value={form.zoneName} onChange={e => setForm(f => ({ ...f, zoneName: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>City *</Label>
          <Input placeholder="Toronto" data-testid="input-city" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Province</Label>
          <Input placeholder="ON" data-testid="input-province" value={form.province} onChange={e => setForm(f => ({ ...f, province: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Service Radius (km)</Label>
          <Input type="number" placeholder="50" data-testid="input-radius" value={form.serviceRadiusKm} onChange={e => setForm(f => ({ ...f, serviceRadiusKm: e.target.value }))} />
        </div>
      </div>
      <Button onClick={() => addZone.mutate()} disabled={addZone.isPending || !form.zoneName || !form.city} data-testid="button-add-zone">
        {addZone.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding…</> : "Add Zone"}
      </Button>

      {isLoading ? null : zones.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">Coverage Zones ({zones.length})</p>
          {zones.map((z: any) => (
            <div key={z.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50" data-testid={`row-zone-${z.id}`}>
              <div>
                <p className="text-sm font-medium">{z.zoneName}</p>
                <p className="text-xs text-muted-foreground">{z.city}{z.province ? `, ${z.province}` : ""}{z.serviceRadiusKm ? ` · ${z.serviceRadiusKm}km radius` : ""}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => deleteZone.mutate(z.id)} data-testid={`button-delete-zone-${z.id}`}>Remove</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DispatchForm({ partner, onSave }: { partner: any; onSave: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    dispatchMethod: partner?.dispatchMethod ?? "manual",
    dispatchPhone: partner?.dispatchPhone ?? "",
    dispatchEmail: partner?.dispatchEmail ?? "",
    dispatchNotes: partner?.dispatchNotes ?? "",
  });

  const save = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/partner/dispatch", form),
    onSuccess: () => {
      toast({ title: "Dispatch settings saved" });
      qc.invalidateQueries({ queryKey: ["/api/partner/onboarding"] });
      onSave();
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Dispatch Method</Label>
        <Select value={form.dispatchMethod} onValueChange={v => setForm(f => ({ ...f, dispatchMethod: v }))}>
          <SelectTrigger data-testid="select-dispatch-method"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual — You review and accept each booking</SelectItem>
            <SelectItem value="auto">Auto — Automatically accept matching bookings</SelectItem>
            <SelectItem value="hybrid">Hybrid — Auto-accept some, review others</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Dispatch Phone</Label>
          <Input placeholder="+1 416 555 0100" data-testid="input-dispatch-phone" value={form.dispatchPhone} onChange={e => setForm(f => ({ ...f, dispatchPhone: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Dispatch Email</Label>
          <Input type="email" data-testid="input-dispatch-email" value={form.dispatchEmail} onChange={e => setForm(f => ({ ...f, dispatchEmail: e.target.value }))} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>Additional Notes</Label>
          <Textarea rows={2} placeholder="Any special dispatch instructions…" data-testid="input-dispatch-notes" value={form.dispatchNotes} onChange={e => setForm(f => ({ ...f, dispatchNotes: e.target.value }))} />
        </div>
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-dispatch">
        {save.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save Dispatch Settings"}
      </Button>
    </div>
  );
}

function TermsForm({ accepted, onAccept }: { accepted: boolean; onAccept: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const accept = useMutation({
    mutationFn: () => apiRequest("POST", "/api/partner/terms/accept", {}),
    onSuccess: () => {
      toast({ title: "Terms accepted" });
      qc.invalidateQueries({ queryKey: ["/api/partner/onboarding"] });
      onAccept();
    },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-md bg-muted/50 text-sm space-y-2 max-h-48 overflow-y-auto">
        <p className="font-medium">LervIT Enterprise Partner Agreement</p>
        <p className="text-muted-foreground">By accepting this agreement, you confirm that your organization will fulfill bookings assigned through the LervIT platform in accordance with our service standards, including: timely response to booking offers (within 30 minutes), accurate real-time status updates, professional service delivery, and prompt incident reporting.</p>
        <p className="text-muted-foreground">You agree to maintain current compliance documentation, hold appropriate insurance, and adhere to all applicable laws and regulations governing moving services in your operating area.</p>
        <p className="text-muted-foreground">LervIT reserves the right to suspend or terminate partner access for non-compliance, repeated incidents, or failure to meet service level expectations.</p>
      </div>
      {accepted ? (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-medium">Terms accepted</span>
        </div>
      ) : (
        <Button onClick={() => accept.mutate()} disabled={accept.isPending} data-testid="button-accept-terms">
          {accept.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Accepting…</> : "Accept Terms & Agreement"}
        </Button>
      )}
    </div>
  );
}

export default function PartnerOnboarding() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/partner/onboarding"] });
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const submitForReview = useMutation({
    mutationFn: () => apiRequest("POST", "/api/partner/onboarding/submit", {}),
    onSuccess: () => {
      toast({ title: "Submitted for Lervit review!" });
      qc.invalidateQueries({ queryKey: ["/api/partner/onboarding"] });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Submit failed", variant: "destructive" }),
  });

  const steps = data?.steps ?? [];
  const partner = data?.partner;

  return (
    <PartnerLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-lg font-semibold">Onboarding Checklist</h1>
          <p className="text-sm text-muted-foreground mt-1">Complete all steps to activate your partner account</p>
        </div>

        {data && (
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">{data.completedCount} of {data.totalSteps} steps complete</span>
                <span className="text-sm text-muted-foreground">{data.percentComplete}%</span>
              </div>
              <Progress value={data.percentComplete} className="h-2" data-testid="progress-onboarding" />
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-5 pb-5 h-16 animate-pulse bg-muted/30" /></Card>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {steps.map((step: any, i: number) => (
              <div key={step.key}>
                <StepCard step={step} index={i} onAction={(key) => setActiveStep(activeStep === key ? null : key)} />
                {activeStep === step.key && step.key !== "review" && (
                  <Card className="mt-1 border-t-0 rounded-t-none">
                    <CardContent className="pt-5">
                      {step.key === "profile" && <ProfileForm partner={partner} onSave={() => setActiveStep(null)} />}
                      {step.key === "coverage" && <CoverageForm onSave={() => setActiveStep(null)} />}
                      {step.key === "compliance" && (
                        <div className="text-sm text-muted-foreground">
                          <p>Upload your compliance documents on the <a href="/partner/compliance" className="text-primary underline">Compliance page</a>.</p>
                        </div>
                      )}
                      {step.key === "dispatch" && <DispatchForm partner={partner} onSave={() => setActiveStep(null)} />}
                      {step.key === "team" && (
                        <div className="text-sm text-muted-foreground">
                          <p>Add your drivers and crews on the <a href="/partner/team" className="text-primary underline">Team page</a>.</p>
                        </div>
                      )}
                      {step.key === "terms" && <TermsForm accepted={partner?.termsAccepted ?? false} onAccept={() => setActiveStep(null)} />}
                    </CardContent>
                  </Card>
                )}
              </div>
            ))}
          </div>
        )}

        {data?.readyForReview && partner?.status === "onboarding" && (
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-medium">Ready to submit for review!</p>
                  <p className="text-sm text-muted-foreground">Lervit will review your account within 1-2 business days.</p>
                </div>
                <Button onClick={() => submitForReview.mutate()} disabled={submitForReview.isPending} data-testid="button-submit-review">
                  {submitForReview.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</> : "Submit for Review"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {partner?.status === "pending_approval" && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Your application has been submitted and is under review by the Lervit team. You'll be notified once approved.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </PartnerLayout>
  );
}

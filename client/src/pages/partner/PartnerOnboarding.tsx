import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import {
  CheckCircle, Circle, Building2, MapPin, FileText, Radio, Users,
  ScrollText, Clock, ChevronRight, Loader2, AlertCircle,
} from "lucide-react";

const STEP_ICONS: Record<string, React.ElementType> = {
  profile: Building2,
  coverage: MapPin,
  compliance: FileText,
  dispatch: Radio,
  team: Users,
  terms: ScrollText,
  review: Clock,
};

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
          <Label>Operating Name</Label>
          <Input data-testid="input-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Legal Name</Label>
          <Input data-testid="input-legal-name" value={form.legalName} onChange={e => setForm(f => ({ ...f, legalName: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Billing Email</Label>
          <Input type="email" data-testid="input-billing-email" value={form.billingEmail} onChange={e => setForm(f => ({ ...f, billingEmail: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input data-testid="input-phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Primary Ops Contact</Label>
          <Input placeholder="Name & phone" data-testid="input-ops-contact" value={form.primaryOpsContact} onChange={e => setForm(f => ({ ...f, primaryOpsContact: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Dispatch Contact <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input placeholder="Name & phone" data-testid="input-dispatch-contact" value={form.dispatchContact} onChange={e => setForm(f => ({ ...f, dispatchContact: e.target.value }))} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Business Address</Label>
          <Input data-testid="input-address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Service Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Textarea rows={3} placeholder="Briefly describe your moving services…" data-testid="input-service-description" value={form.serviceDescription} onChange={e => setForm(f => ({ ...f, serviceDescription: e.target.value }))} />
        </div>
      </div>
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-profile">
        {save.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : "Save Profile"}
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
    mutationFn: () => apiRequest("POST", "/api/partner/coverage", {
      ...form, serviceRadiusKm: form.serviceRadiusKm ? parseInt(form.serviceRadiusKm) : null,
    }),
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
    onSuccess: () => { toast({ title: "Zone removed" }); qc.invalidateQueries({ queryKey: ["/api/partner/coverage"] }); },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Zone Name</Label>
          <Input placeholder="e.g. Downtown Toronto" data-testid="input-zone-name" value={form.zoneName} onChange={e => setForm(f => ({ ...f, zoneName: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input placeholder="Toronto" data-testid="input-city" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Province <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input placeholder="ON" data-testid="input-province" value={form.province} onChange={e => setForm(f => ({ ...f, province: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Service Radius (km)</Label>
          <Input type="number" placeholder="50" data-testid="input-radius" value={form.serviceRadiusKm} onChange={e => setForm(f => ({ ...f, serviceRadiusKm: e.target.value }))} />
        </div>
      </div>
      <Button size="sm" onClick={() => addZone.mutate()} disabled={addZone.isPending || !form.zoneName || !form.city} data-testid="button-add-zone">
        {addZone.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Adding…</> : "Add Zone"}
      </Button>

      {!isLoading && zones.length > 0 && (
        <div className="space-y-px rounded-md border mt-2">
          {zones.map((z: any, idx: number) => (
            <div key={z.id}>
              <div className="flex items-center justify-between px-4 py-2.5" data-testid={`row-zone-${z.id}`}>
                <div>
                  <p className="text-sm font-medium">{z.zoneName}</p>
                  <p className="text-xs text-muted-foreground">
                    {z.city}{z.province ? `, ${z.province}` : ""}{z.serviceRadiusKm ? ` · ${z.serviceRadiusKm}km` : ""}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => deleteZone.mutate(z.id)} data-testid={`button-delete-zone-${z.id}`}>
                  Remove
                </Button>
              </div>
              {idx < zones.length - 1 && <Separator className="opacity-40" />}
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
            <SelectItem value="manual">Manual — Review and accept each booking</SelectItem>
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
          <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Textarea rows={2} placeholder="Special dispatch instructions…" data-testid="input-dispatch-notes" value={form.dispatchNotes} onChange={e => setForm(f => ({ ...f, dispatchNotes: e.target.value }))} />
        </div>
      </div>
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-dispatch">
        {save.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : "Save Dispatch Settings"}
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
      <div className="rounded-md border px-4 py-4 text-sm space-y-3 max-h-48 overflow-y-auto bg-muted/30">
        <p className="font-medium">LervIT Enterprise Partner Agreement</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          By accepting this agreement, you confirm that your organization will fulfill bookings assigned through the LervIT platform in accordance with our service standards, including: timely response to booking offers (within 30 minutes), accurate real-time status updates, professional service delivery, and prompt incident reporting.
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          You agree to maintain current compliance documentation, hold appropriate insurance, and adhere to all applicable laws and regulations governing moving services in your operating area.
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          LervIT reserves the right to suspend or terminate partner access for non-compliance, repeated incidents, or failure to meet service level expectations.
        </p>
      </div>
      {accepted ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle className="w-4 h-4 text-green-500" />
          Terms accepted
        </div>
      ) : (
        <Button size="sm" onClick={() => accept.mutate()} disabled={accept.isPending} data-testid="button-accept-terms">
          {accept.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Accepting…</> : "Accept Terms"}
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
      toast({ title: "Submitted for review" });
      qc.invalidateQueries({ queryKey: ["/api/partner/onboarding"] });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Submit failed", variant: "destructive" }),
  });

  const steps = data?.steps ?? [];
  const partner = data?.partner;
  const pct = data?.percentComplete ?? 0;

  return (
    <PartnerLayout>
      <div className="p-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Onboarding</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete all steps to activate your partner account
          </p>
        </div>

        {/* Progress */}
        {data && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{data.completedCount} of {data.totalSteps} steps complete</span>
              <span>{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5" data-testid="progress-onboarding" />
          </div>
        )}

        <Separator />

        {/* Pending approval banner */}
        {partner?.status === "pending_approval" && (
          <div className="flex items-start gap-2.5 rounded-md border px-4 py-3">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Application submitted and under review. You'll be notified once approved.
            </p>
          </div>
        )}

        {/* Steps */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : (
          <div className="space-y-px">
            {steps.map((step: any, i: number) => {
              const Icon = STEP_ICONS[step.key] ?? Circle;
              const isOpen = activeStep === step.key;
              return (
                <div key={step.key}>
                  <div
                    className="flex items-center gap-4 py-3.5 px-2 rounded-md hover-elevate cursor-pointer"
                    onClick={() => step.key !== "review" && setActiveStep(isOpen ? null : step.key)}
                    data-testid={`card-step-${step.key}`}
                  >
                    <div className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${
                      step.complete ? "bg-green-500/10" : "bg-muted"
                    }`}>
                      {step.complete
                        ? <CheckCircle className="w-4 h-4 text-green-500" />
                        : <Icon className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{step.label}</p>
                        <span className={`text-xs ${step.complete ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                          {step.complete ? "Complete" : "Pending"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                    </div>
                    {step.key !== "review" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs shrink-0"
                        onClick={e => { e.stopPropagation(); setActiveStep(isOpen ? null : step.key); }}
                        data-testid={`button-step-${step.key}`}
                      >
                        {step.complete ? "Edit" : "Complete"} <ChevronRight className={`w-3 h-3 ml-0.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      </Button>
                    )}
                  </div>

                  {isOpen && step.key !== "review" && (
                    <div className="px-2 pb-4">
                      <div className="rounded-md border p-4 bg-muted/20">
                        {step.key === "profile" && <ProfileForm partner={partner} onSave={() => setActiveStep(null)} />}
                        {step.key === "coverage" && <CoverageForm onSave={() => setActiveStep(null)} />}
                        {step.key === "compliance" && (
                          <p className="text-sm text-muted-foreground">
                            Upload documents on the{" "}
                            <a href="/partner/compliance" className="underline text-foreground">Compliance page</a>.
                          </p>
                        )}
                        {step.key === "dispatch" && <DispatchForm partner={partner} onSave={() => setActiveStep(null)} />}
                        {step.key === "team" && (
                          <p className="text-sm text-muted-foreground">
                            Add drivers and crews on the{" "}
                            <a href="/partner/team" className="underline text-foreground">Team page</a>.
                          </p>
                        )}
                        {step.key === "terms" && <TermsForm accepted={partner?.termsAccepted ?? false} onAccept={() => setActiveStep(null)} />}
                      </div>
                    </div>
                  )}

                  {i < steps.length - 1 && <Separator className="opacity-30" />}
                </div>
              );
            })}
          </div>
        )}

        {/* Submit for review */}
        {data?.readyForReview && partner?.status === "onboarding" && (
          <div className="rounded-md border px-4 py-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium">Ready to submit</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lervit will review your account within 1–2 business days
                </p>
              </div>
              <Button size="sm" onClick={() => submitForReview.mutate()} disabled={submitForReview.isPending} data-testid="button-submit-review">
                {submitForReview.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Submitting…</> : "Submit for Review"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </PartnerLayout>
  );
}

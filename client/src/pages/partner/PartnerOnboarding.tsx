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
    phone: partner?.phone ?? "",
    // Primary Ops structured fields
    primaryOpsContact: partner?.primaryOpsContact ?? "",
    primaryOpsEmail: partner?.primaryOpsEmail ?? "",
    primaryOpsPhone: partner?.primaryOpsPhone ?? "",
    // Dispatch contact structured fields (also feeds dispatch config)
    dispatchContact: partner?.dispatchContact ?? "",
    dispatchEmail: partner?.dispatchEmail ?? "",
    dispatchPhone: partner?.dispatchPhone ?? "",
    escalationContact: partner?.escalationContact ?? "",
    address: partner?.address ?? "",
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

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="space-y-6">
      {/* Business info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Operating Name *</Label>
          <Input data-testid="input-name" value={form.name} onChange={set("name")} />
        </div>
        <div className="space-y-1.5">
          <Label>Legal Name *</Label>
          <Input data-testid="input-legal-name" value={form.legalName} onChange={set("legalName")} />
        </div>
        <div className="space-y-1.5">
          <Label>Billing Email *</Label>
          <Input type="email" data-testid="input-billing-email" value={form.billingEmail} onChange={set("billingEmail")} />
        </div>
        <div className="space-y-1.5">
          <Label>Company Phone</Label>
          <Input data-testid="input-phone" value={form.phone} onChange={set("phone")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Business Address *</Label>
          <Input data-testid="input-address" value={form.address} onChange={set("address")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Service Description</Label>
          <Textarea rows={3} placeholder="Briefly describe your moving services…" data-testid="input-service-description" value={form.serviceDescription} onChange={set("serviceDescription")} />
        </div>
      </div>

      {/* Primary Ops Contact */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Primary Ops Contact *</p>
        <p className="text-xs text-muted-foreground -mt-1">This person receives booking routing alerts and urgent notifications directly.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Full Name</Label>
            <Input placeholder="Jane Smith" data-testid="input-ops-contact" value={form.primaryOpsContact} onChange={set("primaryOpsContact")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" placeholder="jane@company.com" data-testid="input-ops-email" value={form.primaryOpsEmail} onChange={set("primaryOpsEmail")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Phone</Label>
            <Input placeholder="+1 403 555 0100" data-testid="input-ops-phone" value={form.primaryOpsPhone} onChange={set("primaryOpsPhone")} />
          </div>
        </div>
      </div>

      {/* Dispatch Contact */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Dispatch Contact</p>
        <p className="text-xs text-muted-foreground -mt-1">Who handles day-to-day job dispatch. Also pre-fills your Dispatch Setup configuration.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Full Name</Label>
            <Input placeholder="Alex Johnson" data-testid="input-dispatch-contact" value={form.dispatchContact} onChange={set("dispatchContact")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" placeholder="dispatch@company.com" data-testid="input-dispatch-email" value={form.dispatchEmail} onChange={set("dispatchEmail")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Phone</Label>
            <Input placeholder="+1 403 555 0200" data-testid="input-dispatch-phone" value={form.dispatchPhone} onChange={set("dispatchPhone")} />
          </div>
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

  const hasProfileDispatch = !!(partner?.dispatchEmail || partner?.dispatchPhone);

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
          {hasProfileDispatch && partner?.dispatchPhone && !form.dispatchPhone && (
            <p className="text-xs text-muted-foreground">Pre-filled from profile</p>
          )}
          <Input placeholder="+1 416 555 0100" data-testid="input-dispatch-phone" value={form.dispatchPhone} onChange={e => setForm(f => ({ ...f, dispatchPhone: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Dispatch Email</Label>
          {hasProfileDispatch && partner?.dispatchEmail && !form.dispatchEmail && (
            <p className="text-xs text-muted-foreground">Pre-filled from profile</p>
          )}
          <Input type="email" data-testid="input-dispatch-email" value={form.dispatchEmail} onChange={e => setForm(f => ({ ...f, dispatchEmail: e.target.value }))} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>Additional Notes</Label>
          <Textarea rows={2} placeholder="Any special dispatch instructions…" data-testid="input-dispatch-notes" value={form.dispatchNotes} onChange={e => setForm(f => ({ ...f, dispatchNotes: e.target.value }))} />
        </div>
      </div>
      {hasProfileDispatch && (
        <p className="text-xs text-muted-foreground">
          Dispatch email and phone are set from your Company Profile contact fields. Update them there to keep everything in sync.
        </p>
      )}
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
      <div className="p-4 rounded-md bg-muted/50 text-sm space-y-5 max-h-96 overflow-y-auto leading-relaxed">

        <div>
          <p className="font-semibold text-foreground text-base">LervIT Platform Fulfillment Partner Agreement</p>
          <p className="text-muted-foreground mt-1">Effective upon acceptance. This agreement governs the platform fulfillment partnership between LervIT Technologies Corporation ("LervIT") and your organization ("Partner"). By accepting, you confirm you are authorized to bind your organization to these terms.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">1. Partnership Model</p>
          <p className="text-muted-foreground mt-1">LervIT operates as the customer-facing platform, booking layer, pricing and dispatch system, and payment orchestration layer. The Partner operates as an approved fulfillment partner responsible for performing eligible bookings routed through the LervIT platform. This is a platform fulfillment partnership — not an employment, agency, or joint-venture relationship.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">2. Role of LervIT</p>
          <p className="text-muted-foreground mt-1">LervIT is responsible for: customer acquisition and booking intake; customer-facing platform experience; pricing presentation; dispatch logic and routing; booking notifications; payment collection and payout orchestration; customer support coordination at the platform level; and performance monitoring and reporting.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">3. Role of Partner</p>
          <p className="text-muted-foreground mt-1">The Partner is responsible for: accepting and fulfilling eligible routed bookings; maintaining vehicle and crew availability; complying with agreed service levels; ensuring all drivers and operators are properly licensed, insured, and qualified; performing transport and job execution professionally and safely; notifying LervIT promptly of any service issues, delays, damages, or incidents; and providing all documentation reasonably required for onboarding and compliance.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">4. Territory</p>
          <p className="text-muted-foreground mt-1">The initial service territory is Calgary, Alberta. Future expansion to Edmonton, Vancouver, Victoria, or other territories is subject to successful performance and mutual written agreement. The Partner shall not accept platform bookings outside approved territories without prior written consent from LervIT.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">5. Eligible Service Categories</p>
          <p className="text-muted-foreground mt-1">Eligible services include: small moves, furniture pickups, short-haul delivery, bulky item transport, selected apartment and residential moves, and selected commercial and local logistics jobs. Excluded during the pilot unless otherwise approved in writing: specialized fragile freight, highly regulated goods, jobs outside approved zones, and categories not yet supported by platform logic.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">6. Vehicle Classes</p>
          <p className="text-muted-foreground mt-1">The Partner may be configured on the platform for one or more approved vehicle classes: pickup truck, cargo van, cube van, moving truck, and larger truck classes as applicable. Final mapped classes and job eligibility rules are determined during onboarding and may be updated by LervIT with notice.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">7. Dispatch Model</p>
          <p className="text-muted-foreground mt-1">Bookings originate through LervIT. LervIT determines eligibility and routes jobs based on service rules, vehicle fit, geography, and availability. The Partner receives booking opportunities through the portal or agreed communication channels and must accept or decline within the agreed response window. Unaccepted bookings may be reassigned at LervIT's discretion. LervIT retains final authority over all dispatch logic.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">8. Commercial Structure &amp; Payouts</p>
          <p className="text-muted-foreground mt-1">The default structure is a marketplace commission model: the customer pays LervIT through the platform; LervIT retains a platform fee or commission; and the Partner receives the agreed fulfillment payout. Payouts will be made on a daily or weekly cycle, traceable to specific booking IDs. For selected large, regional, or non-standard jobs, a negotiated payout schedule may apply — such exceptions require prior written approval. Disputed amounts, refunds, chargebacks, or incident-based deductions will follow agreed dispute rules.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">9. Pricing Authority</p>
          <p className="text-muted-foreground mt-1">Customer-facing pricing is set by LervIT based on vehicle class, service zone, distance band, labor and crew requirements, complexity factors, urgency, and approved exceptions. The Partner may provide acceptable payout thresholds and operational pricing inputs. Final customer-facing pricing authority rests with LervIT, subject to agreed commercial guardrails.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">10. Service Level Expectations</p>
          <p className="text-muted-foreground mt-1">The Partner must meet service standards including: timely response to booking offers within the agreed response window; pickup punctuality; booking completion reliability; low cancellation rates; professional conduct at all times; and appropriate handling of customer property. Specific metrics will be documented in the Pilot Scope or SLA. Repeated failures to meet service levels may result in suspension or termination.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">11. Non-Circumvention</p>
          <p className="text-muted-foreground mt-1">The Partner shall not: divert LervIT-sourced customers off-platform; solicit direct repeat business from customers introduced through LervIT using platform-sourced information; bypass LervIT payment workflows for platform-originated bookings; or otherwise circumvent LervIT's role as platform operator. Breach of this clause is grounds for immediate suspension and may result in financial liability.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">12. Data and Confidentiality</p>
          <p className="text-muted-foreground mt-1">All confidential business, pricing, customer, operational, and technical information exchanged in connection with this partnership must be treated as confidential. Use of shared data is limited to evaluating, onboarding, operating, and improving the partnership. Customer data collected through the LervIT platform remains the property of LervIT. The Partner shall not use, sell, or share such data for any other purpose.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">13. Compliance and Insurance</p>
          <p className="text-muted-foreground mt-1">Before activation and at all times during the partnership, the Partner must maintain and provide upon request: legal entity and business registration details; proof of applicable liability insurance; proof of vehicle and transport insurance; dispatcher and operational contacts; valid driver licensing for all operators; and any additional compliance materials reasonably requested by LervIT. Failure to maintain current compliance documentation may result in suspension.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">14. Pilot Duration and Review</p>
          <p className="text-muted-foreground mt-1">The initial pilot term is 90 days from the activation date. At the end of the pilot, both parties will review booking volume, acceptance rate, completion performance, customer experience, commercial viability, and operational fit before deciding on continuation or expansion.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">15. Exclusivity</p>
          <p className="text-muted-foreground mt-1">This partnership is non-exclusive. Either party may engage with other partners or platforms. Exclusivity discussions may be initiated only after successful pilot completion demonstrating strong commercial and operational performance, and must be agreed to in writing.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">16. Termination</p>
          <p className="text-muted-foreground mt-1">Either party may terminate this partnership with 30 days' written notice if the partnership is not commercially viable, service levels are not met, compliance or trust issues arise, or there is material breach of agreed terms. Immediate suspension rights apply in the event of fraud, safety risk, repeated customer harm, off-platform diversion, or failure to maintain required insurance or licensing.</p>
        </div>

        <div>
          <p className="font-medium text-foreground">17. Platform Control</p>
          <p className="text-muted-foreground mt-1">LervIT owns the booking environment, payment workflow, platform data, and dispatch layer. All platform-originated bookings must be handled through approved LervIT workflows. Customer relationships established through the LervIT platform belong to LervIT.</p>
        </div>

        <div className="border-t pt-4 border-border">
          <p className="text-muted-foreground text-xs">LervIT Technologies Corporation · Effective {new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })}. By accepting below, you confirm you have read, understood, and agree to be bound by all terms above on behalf of your organization.</p>
        </div>

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

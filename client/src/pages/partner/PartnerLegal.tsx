import { useQuery } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Download, Printer, ShieldCheck, Lock, Database, Code2, FileText } from "lucide-react";
import { format } from "date-fns";

const CLAUSES = [
  {
    title: "1. Partnership Model",
    body: "LervIT operates as the customer-facing platform, booking layer, pricing and dispatch system, and payment orchestration layer. The Partner operates as an approved fulfillment partner responsible for performing eligible bookings routed through the LervIT platform. This is a platform fulfillment partnership — not an employment, agency, or joint-venture relationship.",
  },
  {
    title: "2. Role of LervIT",
    body: "LervIT is responsible for: customer acquisition and booking intake; customer-facing platform experience; pricing presentation; dispatch logic and routing; booking notifications; payment collection and payout orchestration; customer support coordination at the platform level; and performance monitoring and reporting.",
  },
  {
    title: "3. Role of Partner",
    body: "The Partner is responsible for: accepting and fulfilling eligible routed bookings; maintaining vehicle and crew availability; complying with agreed service levels; ensuring all drivers and operators are properly licensed, insured, and qualified; performing transport and job execution professionally and safely; notifying LervIT promptly of any service issues, delays, damages, or incidents; and providing all documentation reasonably required for onboarding and compliance.",
  },
  {
    title: "4. Territory",
    body: "The initial service territory is Calgary, Alberta. Future expansion to Edmonton, Vancouver, Victoria, or other territories is subject to successful performance and mutual written agreement. The Partner shall not accept platform bookings outside approved territories without prior written consent from LervIT.",
  },
  {
    title: "5. Eligible Service Categories",
    body: "Eligible services include: small moves, furniture pickups, short-haul delivery, bulky item transport, selected apartment and residential moves, and selected commercial and local logistics jobs. Excluded during the pilot unless otherwise approved in writing: specialized fragile freight, highly regulated goods, jobs outside approved zones, and categories not yet supported by platform logic.",
  },
  {
    title: "6. Vehicle Classes",
    body: "The Partner may be configured on the platform for one or more approved vehicle classes: pickup truck, cargo van, cube van, moving truck, and larger truck classes as applicable. Final mapped classes and job eligibility rules are determined during onboarding and may be updated by LervIT with notice.",
  },
  {
    title: "7. Dispatch Model",
    body: "Bookings originate through LervIT. LervIT determines eligibility and routes jobs based on service rules, vehicle fit, geography, and availability. The Partner receives booking opportunities through the portal or agreed communication channels and must accept or decline within the agreed response window. Unaccepted bookings may be reassigned at LervIT's discretion. LervIT retains final authority over all dispatch logic.",
  },
  {
    title: "8. Commercial Structure & Payouts",
    body: "The default structure is a marketplace commission model: the customer pays LervIT through the platform; LervIT retains a platform fee or commission; and the Partner receives the agreed fulfillment payout. Payouts will be made on a daily or weekly cycle, traceable to specific booking IDs. For selected large, regional, or non-standard jobs, a negotiated payout schedule may apply — such exceptions require prior written approval. Disputed amounts, refunds, chargebacks, or incident-based deductions will follow agreed dispute rules.",
  },
  {
    title: "9. Pricing Authority",
    body: "Customer-facing pricing is set by LervIT based on vehicle class, service zone, distance band, labor and crew requirements, complexity factors, urgency, and approved exceptions. The Partner may provide acceptable payout thresholds and operational pricing inputs. Final customer-facing pricing authority rests with LervIT, subject to agreed commercial guardrails.",
  },
  {
    title: "10. Service Level Expectations",
    body: "The Partner must meet service standards including: timely response to booking offers within the agreed response window; pickup punctuality; booking completion reliability; low cancellation rates; professional conduct at all times; and appropriate handling of customer property. Specific metrics will be documented in the Pilot Scope or SLA. Repeated failures to meet service levels may result in suspension or termination.",
  },
  {
    title: "11. Non-Circumvention",
    body: "The Partner shall not: divert LervIT-sourced customers off-platform; solicit direct repeat business from customers introduced through LervIT using platform-sourced information; bypass LervIT payment workflows for platform-originated bookings; or otherwise circumvent LervIT's role as platform operator. Breach of this clause is grounds for immediate suspension and may result in financial liability.",
  },
  {
    title: "12. Data and Confidentiality",
    body: "All confidential business, pricing, customer, operational, and technical information exchanged in connection with this partnership must be treated as confidential. Use of shared data is limited to evaluating, onboarding, operating, and improving the partnership. Customer data collected through the LervIT platform remains the property of LervIT. The Partner shall not use, sell, or share such data for any other purpose.",
  },
  {
    title: "13. Compliance and Insurance",
    body: "Before activation and at all times during the partnership, the Partner must maintain and provide upon request: legal entity and business registration details; proof of applicable liability insurance; proof of vehicle and transport insurance; dispatcher and operational contacts; valid driver licensing for all operators; and any additional compliance materials reasonably requested by LervIT. Failure to maintain current compliance documentation may result in suspension.",
  },
  {
    title: "14. Pilot Duration and Review",
    body: "The initial pilot term is 90 days from the activation date. At the end of the pilot, both parties will review booking volume, acceptance rate, completion performance, customer experience, commercial viability, and operational fit before deciding on continuation or expansion.",
  },
  {
    title: "15. Exclusivity",
    body: "This partnership is non-exclusive. Either party may engage with other partners or platforms. Exclusivity discussions may be initiated only after successful pilot completion demonstrating strong commercial and operational performance, and must be agreed to in writing.",
  },
  {
    title: "16. Termination",
    body: "Either party may terminate this partnership with 30 days' written notice if the partnership is not commercially viable, service levels are not met, compliance or trust issues arise, or there is material breach of agreed terms. Immediate suspension rights apply in the event of fraud, safety risk, repeated customer harm, off-platform diversion, or failure to maintain required insurance or licensing.",
  },
  {
    title: "17. Platform Control",
    body: "LervIT owns the booking environment, payment workflow, platform data, and dispatch layer. All platform-originated bookings must be handled through approved LervIT workflows. Customer relationships established through the LervIT platform belong to LervIT.",
  },
  {
    title: "18. Intellectual Property Protection",
    body: "All technology, software, algorithms, data models, dispatch logic, pricing systems, matching systems, user interface designs, branding, trademarks, trade secrets, and proprietary processes developed by or belonging to LervIT Technologies Corporation (collectively, 'LervIT IP') are and remain the exclusive property of LervIT Technologies Corporation. The Partner receives a limited, non-exclusive, non-transferable, revocable license to access the LervIT partner portal solely for the purpose of fulfilling approved bookings. The Partner expressly agrees not to: (a) reverse-engineer, decompile, disassemble, or otherwise attempt to derive the source code, algorithms, or underlying logic of any LervIT platform component; (b) replicate, reproduce, or create derivative works based on any LervIT IP; (c) use knowledge, data, pricing logic, or operational insights gained through the partnership to build, assist, fund, or advise any competing platform or service; (d) disclose LervIT's proprietary methodologies, pricing models, matching algorithms, or dispatch rules to any third party; or (e) retain any copies of LervIT platform data, documentation, or technical materials beyond what is strictly necessary for active fulfillment of approved bookings. Upon termination of the partnership for any reason, all access to LervIT systems and data is immediately revoked, and the Partner must certify in writing within 30 days that all LervIT confidential materials have been deleted or destroyed. Breach of this clause may result in immediate legal action and financial liability. Nothing in this agreement transfers any ownership of LervIT IP to the Partner.",
  },
  {
    title: "19. Governing Law",
    body: "This agreement is governed by the laws of the Province of Alberta, Canada. Any disputes shall be resolved in the courts of Calgary, Alberta, unless both parties agree in writing to an alternative dispute resolution mechanism. The United Nations Convention on Contracts for the International Sale of Goods does not apply.",
  },
];

const DATA_POLICY_SECTIONS = [
  {
    icon: Database,
    title: "Data We Collect Through Your Use of the Portal",
    body: "We collect booking activity, team member details you enter, document uploads, audit log events, and usage patterns within the partner portal. This data is used to operate the partnership, process payouts, and improve the platform.",
  },
  {
    icon: Lock,
    title: "Customer Data",
    body: "Customer names, contact details, addresses, and booking history that flow through the LervIT platform are owned by LervIT Technologies Corporation. You may access this data only to fulfill specific bookings. You may not store, aggregate, export, or use this data for any purpose other than completing an assigned job.",
  },
  {
    icon: Code2,
    title: "Platform Data",
    body: "Pricing logic, dispatch rules, matching outputs, algorithm parameters, and any technical data about how the platform operates are LervIT confidential information. You may not store, share, or reverse-engineer this data.",
  },
  {
    icon: ShieldCheck,
    title: "Your Rights",
    body: "You may request a copy of the data we hold about your organization at any time by contacting your partner success manager. Upon termination of the partnership, all your organizational data in the portal will be archived and access will be revoked within 48 hours.",
  },
];

export default function PartnerLegal() {
  const { data: ctx } = useQuery<any>({ queryKey: ["/api/partner/me"] });
  const partner = ctx?.partner;

  const acceptedAt = partner?.termsAcceptedAt
    ? format(new Date(partner.termsAcceptedAt), "PPPp")
    : null;

  function handlePrint() {
    window.print();
  }

  return (
    <PartnerLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-8 print:p-0 print:max-w-none">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-lg font-semibold">Legal & Terms</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your Partner Agreement and Data Use Policy with LervIT Technologies Corporation
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print-terms">
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Print
            </Button>
          </div>
        </div>

        {/* Acceptance status */}
        {partner && (
          <div className={`rounded-lg p-4 flex items-center gap-3 ${partner.termsAccepted ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800" : "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"}`}>
            <CheckCircle className={`w-5 h-5 shrink-0 ${partner.termsAccepted ? "text-green-600" : "text-amber-500"}`} />
            <div>
              {partner.termsAccepted ? (
                <>
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">Agreement accepted</p>
                  {acceptedAt && (
                    <p className="text-xs text-green-600/80 dark:text-green-500/80 mt-0.5">
                      Accepted on {acceptedAt} by an authorized representative of {partner.name ?? "your organization"}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Terms not yet accepted</p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-0.5">
                    Complete the Terms & Agreement step in Onboarding to accept this agreement.
                  </p>
                </>
              )}
            </div>
            {partner.termsAccepted && (
              <Badge variant="secondary" className="ml-auto shrink-0">Binding</Badge>
            )}
          </div>
        )}

        {/* Agreement document */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">LervIT Platform Fulfillment Partner Agreement</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              LervIT Technologies Corporation · This agreement is effective upon acceptance and governs the platform fulfillment partnership between LervIT Technologies Corporation ("LervIT") and your organization ("Partner").
            </p>
          </div>

          <Separator />

          <div className="space-y-5">
            {CLAUSES.map((clause) => (
              <div key={clause.title} className={clause.title.startsWith("18") ? "rounded-lg p-4 bg-muted/60 border border-border" : ""}>
                {clause.title.startsWith("18") && (
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                    <Badge variant="outline" className="text-xs">IP Protection</Badge>
                  </div>
                )}
                <p className="text-sm font-semibold text-foreground">{clause.title}</p>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{clause.body}</p>
              </div>
            ))}
          </div>

          <Separator />

          <p className="text-xs text-muted-foreground">
            LervIT Technologies Corporation · By accepting, the authorized representative of the Partner confirms they have read, understood, and agree to be bound by all terms above on behalf of their organization.
          </p>
        </div>

        {/* Data Use Policy */}
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Data Use Policy</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              How LervIT Technologies Corporation collects, uses, and protects data in the context of the partner relationship.
            </p>
          </div>

          <Separator />

          <div className="space-y-5">
            {DATA_POLICY_SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.title} className="flex gap-3">
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{s.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Contact */}
        <div className="rounded-lg p-4 bg-muted/40 space-y-1">
          <p className="text-sm font-medium">Questions about this agreement?</p>
          <p className="text-sm text-muted-foreground">
            Contact your partner success manager or reach LervIT at{" "}
            <button
              className="text-primary underline underline-offset-2"
              onClick={() => { window.location.href = ["mailto", "legal@lervit.com"].join(":"); }}
            >
              legal@lervit.com
            </button>
          </p>
        </div>

        <div className="pb-8" />
      </div>
    </PartnerLayout>
  );
}

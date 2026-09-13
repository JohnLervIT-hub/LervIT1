import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Phone, Clock, Truck, PhoneCall } from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";

interface NovaStats {
  callsToday: number;
  moversAccepted: number;
  bookingsCreated: number;
  callHoursAllowed: boolean;
  callHoursReason: string | null;
  recentEvents: Array<{
    id: string;
    eventType: string;
    entityId: string | null;
    payload: Record<string, any> | null;
    createdAt: string;
  }>;
}

type NovaAction =
  | "check_call_hours"
  | "call_mover_dispatch"
  | "call_lead_conversion"
  | "call_review_request";

export function NovaCard() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<NovaStats>({
    queryKey: ["/api/admin/agent/nova/stats"],
  });

  const trigger = useMutation({
    mutationFn: async ({
      action,
      dryRun,
      input,
    }: {
      action: NovaAction;
      dryRun: boolean;
      input?: Record<string, any>;
    }) => {
      const res = await apiRequest("POST", "/api/admin/agent/nova/trigger", {
        action,
        input: input ?? {},
        dry_run: dryRun,
      });
      return res.json();
    },
    onSuccess: (payload, { action, dryRun }) => {
      const label =
        action === "check_call_hours"
          ? "Call hours"
          : action === "call_mover_dispatch"
            ? "Mover dispatch"
            : action === "call_lead_conversion"
              ? "Lead conversion"
              : "Review request";
      toast({
        title: dryRun ? `Nova dry-run — ${label}` : `Nova queued — ${label}`,
        description: dryRun
          ? `Preview: ${JSON.stringify(payload?.result ?? {})}`
          : `Job ${payload?.jobId ?? ""} runs in background.`,
      });
      if (!dryRun) {
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/agent/nova/stats"],
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Nova trigger failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const statusLabel = data
    ? data.callHoursAllowed
      ? "Active"
      : `Outside hours (${data.callHoursReason ?? "n/a"})`
    : "—";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <AgentAvatar agentKey="nova-clarke" size="md" showName showRole />
            <CardDescription className="mt-1.5">
              Outbound voice concierge · Mover dispatch, lead conversion, and review calls · 8am–9pm MT
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                trigger.mutate({ action: "check_call_hours", dryRun: false })
              }
              disabled={trigger.isPending}
              data-testid="button-nova-check-hours"
            >
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              Check Hours
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                trigger.mutate({
                  action: "call_mover_dispatch",
                  dryRun: true,
                  input: {
                    moverId: "test-mover",
                    bookingId: "test-booking",
                    earnings: 100,
                    pickupArea: "Downtown",
                    dropoffArea: "Beltline",
                  },
                })
              }
              disabled={trigger.isPending}
              data-testid="button-nova-test-mover"
            >
              <Truck className="w-3.5 h-3.5 mr-1.5" />
              Test Mover Call
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                trigger.mutate({
                  action: "call_lead_conversion",
                  dryRun: true,
                  input: { leadId: "test-lead" },
                })
              }
              disabled={trigger.isPending}
              data-testid="button-nova-test-lead"
            >
              <PhoneCall className="w-3.5 h-3.5 mr-1.5" />
              Test Lead Call
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading voice snapshot…
          </div>
        )}
        {data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatBox
                label="Calls today"
                value={data.callsToday}
                tone="neutral"
                icon={<Phone className="w-3 h-3" />}
              />
              <StatBox
                label="Jobs filled"
                value={data.moversAccepted}
                tone="good"
              />
              <StatBox
                label="Bookings"
                value={data.bookingsCreated}
                tone="good"
              />
              <StatBox
                label="Status"
                value={statusLabel}
                tone={data.callHoursAllowed ? "good" : "warm"}
              />
            </div>
            {data.recentEvents.length > 0 && (
              <div className="rounded-md border">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b">
                  Recent events
                </div>
                <ul className="divide-y">
                  {data.recentEvents.slice(0, 5).map((e) => (
                    <li
                      key={e.id}
                      className="px-3 py-2 flex items-center justify-between gap-3"
                    >
                      <span
                        className={`text-sm font-medium ${eventTone(e.eventType)}`}
                      >
                        {e.eventType.replace(/^nova\./, "")}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {new Date(e.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function eventTone(eventType: string): string {
  if (eventType.includes("call_initiated")) return "text-blue-600";
  if (eventType.includes("call_answered")) return "text-emerald-600";
  if (eventType.includes("booking_created")) return "text-emerald-600";
  if (eventType.includes("mover_accepted")) return "text-emerald-600";
  if (eventType.includes("voicemail_detected")) return "text-amber-600";
  return "text-foreground";
}

function StatBox({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number | string;
  tone?: "good" | "warm" | "bad" | "neutral";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warm"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-red-600"
          : "text-foreground";
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

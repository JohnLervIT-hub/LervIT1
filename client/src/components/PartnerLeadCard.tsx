import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { AgentAvatar } from '@/components/AgentAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Mail, Phone, PhoneOff, Building2, Handshake, MapPin,
  Pencil, X, Check, Copy, MessageSquare, Trash2, Loader2, Tag,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// Only the source channels Sam actually emits today (server/agents/sam.ts
// PROSPECT_QUERIES). Unknown values fall through to a prettified label.
const SOURCE_LABELS: Record<string, string> = {
  sam_places_delivery_co: 'Delivery Company',
  sam_places_delivery_driver: 'Delivery Driver',
  sam_places_logistics: 'Logistics',
  sam_places_courier: 'Courier',
  sam_places_truck_rental: 'Truck Rental',
  sam_places_man_with_truck: 'Owner Operator',
  sam_places_cargo_van: 'Cargo Van',
  sam_places_small_moving: 'Small Moving Co.',
  sam_places_furniture_delivery: 'Furniture Delivery',
  manual: 'Manual Entry',
};

const categoryLabel = (channel: string | null): string => {
  if (!channel) return 'Manual Entry';
  const known = SOURCE_LABELS[channel];
  if (known) return known;
  return channel
    .replace(/^sam_places_/, '')
    .split('_')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
};

// Actual deal stages per shared/schema.ts line 1928. 'hot' and 'converted'
// keys from the design spec are aliased onto the closest real stages.
const DEAL_STAGE_STYLES: Record<string, string> = {
  prospect: 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300',
  contacted: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  warm: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  meeting: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  closed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  lost: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  hot: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  converted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
};

const statusColor = (status: string): string => ({
  new: 'bg-blue-500',
  contacted: 'bg-amber-500',
  converted: 'bg-emerald-500',
  cold: 'bg-slate-400',
}[status] ?? 'bg-slate-400');

const parseAddressFromNotes = (notes: string | null): string | null => {
  if (!notes) return null;
  const match = notes.match(/^Address:\s*(.+)$/m);
  return match?.[1]?.trim() ?? null;
};

// Sam's address strings look like "123 8 Ave SW, Calgary, AB T2P 1B4, Canada".
// Extract the city + province token for a compact display.
const parseCityFromAddress = (address: string | null): string | null => {
  if (!address) return null;
  const parts = address.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const cityPart = parts[parts.length - 3];
    const provPart = parts[parts.length - 2]?.replace(/\s+[A-Z0-9]+$/i, '').trim();
    return provPart ? `${cityPart}, ${provPart}` : cityPart;
  }
  return address;
};

export interface PartnerLead {
  id: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  companyName: string | null;
  sourceChannel: string | null;
  status: string | null;
  dealStage: string | null;
  touchpoints: number | null;
  lastTouchedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface PartnerLeadCardProps {
  lead: PartnerLead;
  onRefresh: () => void;
}

export function PartnerLeadCard({ lead, onRefresh }: PartnerLeadCardProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);

  const [editName, setEditName] = useState(lead.contactName ?? '');
  const [editEmail, setEditEmail] = useState(lead.contactEmail ?? '');
  const [editPhone, setEditPhone] = useState(lead.contactPhone ?? '');
  const [editNotes, setEditNotes] = useState(lead.notes ?? '');

  useEffect(() => {
    setEditName(lead.contactName ?? '');
    setEditEmail(lead.contactEmail ?? '');
    setEditPhone(lead.contactPhone ?? '');
    setEditNotes(lead.notes ?? '');
  }, [lead.contactName, lead.contactEmail, lead.contactPhone, lead.notes]);

  const status = lead.status ?? 'new';
  const dealStage = lead.dealStage ?? 'prospect';
  const isConverted = status === 'converted';
  const isTerminal = isConverted || status === 'cold';

  const displayName = lead.companyName ?? lead.contactName ?? 'Untitled Prospect';
  const category = categoryLabel(lead.sourceChannel);
  const city = parseCityFromAddress(parseAddressFromNotes(lead.notes));

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ description: `${label} copied` });
  };

  const b2bTouchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/agent/sam/trigger', {
        action: 'send_b2b_touch',
        input: { leadId: lead.id, touchNumber: 1 },
        dry_run: false,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.result?.skipped) {
        toast({
          title: 'Skipped',
          description: data.result.reason ?? 'B2B touch skipped',
          variant: 'destructive',
        });
        return;
      }
      toast({ description: `B2B touch sent to ${displayName} ✅` });
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: 'Send failed', description: err?.message, variant: 'destructive' });
    },
  });

  const invitePartnerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/agent/sam/trigger', {
        action: 'auto_invite_partner',
        input: { leadId: lead.id },
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.result?.skipped) {
        toast({
          title: 'Guardrail blocked invite',
          description: data.result.reason ?? 'Invite skipped',
          variant: 'destructive',
        });
        return;
      }
      toast({ description: `${displayName} invited to partner program ✅` });
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: 'Invite failed', description: err?.message, variant: 'destructive' });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PATCH', `/api/admin/agent/leads/${lead.id}`, {
        contactName: editName.trim(),
        contactEmail: editEmail.trim(),
        contactPhone: editPhone.trim(),
        notes: editNotes.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      setEditing(false);
      toast({ description: 'Partner prospect updated' });
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', `/api/admin/agent/leads/${lead.id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ description: 'Partner prospect removed' });
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
    },
  });

  if (editing) {
    return (
      <div className="rounded-xl border-2 border-orange-300 dark:border-orange-800 bg-card overflow-hidden">
        <div className={cn('h-1', statusColor(status))} />
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Edit partner prospect</p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setEditing(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Contact name</label>
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="e.g. John Smith"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Email</label>
              <Input
                type="email"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                placeholder="ops@company.com"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Phone</label>
              <Input
                type="tel"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                placeholder="+1 403-555-0000"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Notes</label>
              <Textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="Company, industry, address, rating..."
                rows={4}
                className="text-sm resize-none"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Save changes
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>

          <div className="pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => {
                if (confirm(`Remove ${displayName}?`)) deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
              Delete prospect
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden" data-testid={`card-partner-lead-${lead.id}`}>
      <div className={cn('h-1', statusColor(status))} />

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-950/50 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" title={displayName}>
                {displayName}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Added {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isConverted ? (
              <Badge className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                <Handshake className="w-3 h-3 mr-1" />
                Partner ✅
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className={cn('text-xs capitalize', DEAL_STAGE_STYLES[dealStage] ?? 'bg-muted')}
              >
                {dealStage}
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0"
              onClick={() => setEditing(true)}
              title="Edit prospect"
              data-testid={`button-edit-partner-${lead.id}`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/50 dark:text-orange-300">
            Sam Places
          </Badge>
          <Badge variant="outline" className="text-xs gap-1">
            <Tag className="w-3 h-3" />
            {category}
          </Badge>
        </div>

        <div className="space-y-1">
          {city && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{city}</span>
            </div>
          )}

          {lead.contactPhone ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <a
                  href={`tel:${lead.contactPhone}`}
                  className="text-primary hover:underline"
                >
                  {lead.contactPhone}
                </a>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 ml-1 shrink-0"
                onClick={() => copyToClipboard(lead.contactPhone!, 'Phone')}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
              <PhoneOff className="w-3.5 h-3.5 shrink-0" />
              No phone captured
            </div>
          )}

          {lead.contactEmail ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs min-w-0">
                <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{lead.contactEmail}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 ml-1 shrink-0"
                onClick={() => copyToClipboard(lead.contactEmail!, 'Email')}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              No email captured
            </div>
          )}
        </div>

        {lead.notes && (
          <div className="bg-muted/40 rounded-lg px-2.5 py-2">
            <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed whitespace-pre-line">
              {lead.notes}
            </p>
          </div>
        )}

        <div className="flex items-center gap-1">
          {[1, 2, 3, 4].map(n => (
            <div
              key={n}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                n <= (lead.touchpoints ?? 0) ? 'bg-orange-500' : 'bg-muted',
              )}
              title={`Touch ${n}${n <= (lead.touchpoints ?? 0) ? ' — sent' : ''}`}
            />
          ))}
        </div>
        {(lead.touchpoints ?? 0) > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>
              T{Math.min(lead.touchpoints ?? 0, 4)} sent
              {lead.lastTouchedAt && (
                <> · {format(new Date(lead.lastTouchedAt), 'MMM d, h:mm a')}</>
              )}
            </span>
          </div>
        )}

        {isConverted && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg px-2.5 py-2">
            <Handshake className="w-3.5 h-3.5 shrink-0" />
            <span>Invited to partner program</span>
          </div>
        )}

        <div className="space-y-2 pt-2 border-t">
          <Button
            className="w-full"
            size="sm"
            variant="outline"
            onClick={() => b2bTouchMutation.mutate()}
            disabled={!lead.contactEmail || b2bTouchMutation.isPending || isTerminal}
            data-testid={`button-sam-b2b-touch-${lead.id}`}
          >
            {b2bTouchMutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Mail className="w-3.5 h-3.5 mr-1.5" />}
            {lead.contactEmail ? 'Send B2B touch' : 'No email — cannot send'}
          </Button>

          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            size="sm"
            onClick={() => {
              if (confirm(
                `Invite ${displayName} as a fleet partner?\n\n` +
                `Sam will create the partner record, generate an invite token, and email the "fleet partner account is ready" link. Guardrails (rating ≥ 4.0, 10+ reviews) are checked server-side.`,
              )) {
                invitePartnerMutation.mutate();
              }
            }}
            disabled={invitePartnerMutation.isPending || isConverted}
            data-testid={`button-sam-invite-partner-${lead.id}`}
          >
            {invitePartnerMutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Handshake className="w-3.5 h-3.5 mr-1.5" />}
            {isConverted ? 'Partner invited' : 'Invite as Partner'}
          </Button>

          <div className="flex items-center gap-2 pt-1">
            <AgentAvatar agentKey="sam-carter" size="sm" />
            <span className="text-xs text-muted-foreground">Sam Carter · SALES</span>
          </div>
        </div>
      </div>
    </div>
  );
}

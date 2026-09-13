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
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Mail, Phone, PhoneOff, Truck, Car,
  Pencil, X, Check, Copy, ExternalLink,
  MessageSquare, Trash2, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const DRIVER_EARNINGS = {
  car:    { min: 25,  max: 45,  label: 'SUV / Car' },
  pickup: { min: 45,  max: 100, label: 'Pickup Truck' },
  van:    { min: 55,  max: 150, label: 'Cargo Van' },
  truck:  { min: 150, max: 350, label: 'Moving Truck' },
} as const;

type VehicleKey = keyof typeof DRIVER_EARNINGS;

const detectVehicle = (notes: string | null): VehicleKey => {
  if (!notes) return 'car';
  const n = notes.toLowerCase();
  if (n.includes('moving truck') || n.includes('26ft') ||
      n.includes('cube truck') || n.includes('box truck')) return 'truck';
  if (n.includes('cargo van') || n.includes('sprinter') ||
      n.includes('transit van') || n.includes('promaster')) return 'van';
  if (n.includes('pickup') || n.includes('f-150') || n.includes('f150') ||
      n.includes('tacoma') || n.includes('silverado') || n.includes('ram 1500')) return 'pickup';
  return 'car';
};

const parseListingUrl = (notes: string | null): string | null => {
  if (!notes) return null;
  const labelled = notes.match(/URL:\s*(https?:\/\/[^\s\n]+)/);
  if (labelled?.[1]) return labelled[1];
  return notes.match(/https?:\/\/[^\s]+/)?.[0] ?? null;
};

const sourceLabel = (channel: string | null): string => {
  if (!channel) return 'Manual';
  const c = channel.toLowerCase();
  if (c.includes('kijiji')) return 'Kijiji';
  if (c.includes('google')) return 'Google Alerts';
  if (c.includes('craigslist')) return 'Craigslist';
  if (c.includes('reddit')) return 'Reddit';
  if (c.includes('facebook')) return 'Facebook';
  if (c.includes('referral')) return 'Referral';
  if (c.includes('manual') || c === 'admin-manual') return 'Manual';
  return channel;
};

const statusColor = (status: string): string => ({
  new:       'bg-blue-500',
  contacted: 'bg-amber-500',
  converted: 'bg-emerald-500',
  cold:      'bg-slate-400',
}[status] ?? 'bg-slate-400');

export interface MoverLead {
  id: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string | null;
  intentScore: number | null;
  touchpoints: number | null;
  lastTouchedAt: string | null;
  notes: string | null;
  sourceChannel: string | null;
  createdAt: string;
}

interface MoverCandidateCardProps {
  lead: MoverLead;
  onRefresh: () => void;
}

export function MoverCandidateCard({ lead, onRefresh }: MoverCandidateCardProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);

  const [editName, setEditName] = useState(lead.contactName ?? '');
  const [editEmail, setEditEmail] = useState(lead.contactEmail ?? '');
  const [editPhone, setEditPhone] = useState(lead.contactPhone ?? '');
  const [editVehicle, setEditVehicle] = useState<VehicleKey>(detectVehicle(lead.notes));
  const [editNotes, setEditNotes] = useState(lead.notes ?? '');

  const [savedEmail, setSavedEmail] = useState<string | null>(lead.contactEmail);
  const [savedPhone, setSavedPhone] = useState<string | null>(lead.contactPhone);

  useEffect(() => {
    setSavedEmail(lead.contactEmail);
    setSavedPhone(lead.contactPhone);
  }, [lead.contactEmail, lead.contactPhone]);

  useEffect(() => {
    setEditName(lead.contactName ?? '');
    setEditEmail(lead.contactEmail ?? '');
    setEditPhone(lead.contactPhone ?? '');
    setEditNotes(lead.notes ?? '');
  }, [lead.contactName, lead.contactEmail, lead.contactPhone, lead.notes]);

  const vehicle = detectVehicle(lead.notes);
  const earnings = DRIVER_EARNINGS[vehicle];
  const listingUrl = parseListingUrl(lead.notes);
  const status = lead.status ?? 'new';
  const isTerminal = status === 'converted' || status === 'cold';

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ description: `${label} copied` });
  };

  const emailMutation = useMutation({
    mutationFn: async (channel: 'email' | 'sms' = 'email') => {
      const res = await apiRequest('POST', '/api/admin/agent/jordan/trigger', {
        action: 'onboard_candidate',
        leadId: lead.id,
        channelOverride: channel,
      });
      return res.json();
    },
    onSuccess: (data, channel) => {
      if (data?.result?.skipped) {
        toast({
          title: 'Skipped',
          description: data.result.reason === 'already_contacted_today'
            ? 'Already contacted today'
            : data.result.reason ?? (channel === 'sms' ? 'No phone available' : 'No email available'),
          variant: 'destructive',
        });
        return;
      }
      const label = channel === 'sms' ? 'SMS' : 'Email';
      const target = channel === 'sms'
        ? (lead.contactPhone ?? 'candidate')
        : (lead.contactName ?? lead.contactEmail ?? 'candidate');
      toast({
        title: 'Jordan Hayes',
        description: `${label} queued for ${target}`,
      });
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: 'Send failed', description: err?.message, variant: 'destructive' });
    },
  });

  const smsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/agent/jordan/trigger', {
        action: 'onboard_candidate',
        leadId: lead.id,
        channelOverride: 'sms',
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.result?.skipped) {
        toast({
          title: 'Skipped',
          description: data.result.reason === 'already_contacted_today'
            ? 'Already contacted today'
            : data.result.reason ?? 'No phone available',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Jordan Hayes',
        description: 'SMS queued for ' + (lead.contactPhone ?? 'candidate'),
      });
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: 'SMS failed', description: err?.message, variant: 'destructive' });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = editName.trim();
      const trimmedEmail = editEmail.trim();
      const trimmedPhone = editPhone.trim();
      const baseNotes = editNotes.trim();
      const currentVehicleTag = `Vehicle: ${DRIVER_EARNINGS[editVehicle].label}`;
      const notesWithVehicle = baseNotes.includes('Vehicle:')
        ? baseNotes.replace(/Vehicle:.*$/m, currentVehicleTag)
        : [currentVehicleTag, baseNotes].filter(Boolean).join('\n');
      const res = await apiRequest('PATCH', `/api/admin/agent/leads/${lead.id}`, {
        contactName:  trimmedName,
        contactEmail: trimmedEmail,
        contactPhone: trimmedPhone,
        notes: notesWithVehicle,
      });
      return res.json();
    },
    onSuccess: async () => {
      const hadNoContact = !lead.contactEmail && !lead.contactPhone;
      const trimmedEmail = editEmail.trim();
      const trimmedPhone = editPhone.trim();
      const nowHasContact = !!(trimmedEmail || trimmedPhone);

      setSavedEmail(trimmedEmail || null);
      setSavedPhone(trimmedPhone || null);
      setEditing(false);
      onRefresh();

      if (hadNoContact && nowHasContact) {
        toast({
          title: 'Contact added',
          description: 'Sending outreach via Jordan...',
        });

        await new Promise(r => setTimeout(r, 500));

        const channel: 'email' | 'sms' = trimmedEmail ? 'email' : 'sms';
        emailMutation.mutate(channel);
      } else {
        toast({ description: 'Candidate updated' });
      }
    },
    onError: (err: any) => {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    },
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PATCH', `/api/admin/agent/leads/${lead.id}`, {
        status: 'converted',
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ description: 'Marked as converted' });
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: 'Update failed', description: err?.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', `/api/admin/agent/leads/${lead.id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ description: 'Candidate removed' });
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
    },
  });

  if (editing) {
    return (
      <div className="rounded-xl border-2 border-blue-300 dark:border-blue-700 bg-card overflow-hidden">
        <div className={cn('h-1', statusColor(status))} />
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Edit candidate</p>
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
              <label className="text-xs text-muted-foreground block mb-1">Name</label>
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
                placeholder="name@email.com"
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
              <label className="text-xs text-muted-foreground block mb-1">Vehicle</label>
              <Select value={editVehicle} onValueChange={v => setEditVehicle(v as VehicleKey)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(DRIVER_EARNINGS) as Array<[VehicleKey, typeof DRIVER_EARNINGS[VehicleKey]]>).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      {val.label} (${val.min}–${val.max}/job)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Notes</label>
              <Textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="Source, availability, area, listing URL..."
                rows={3}
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
                if (confirm('Remove this candidate?')) deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
              Delete candidate
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden" data-testid={`card-mover-candidate-${lead.id}`}>
      <div className={cn('h-1', statusColor(status))} />

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm shrink-0">
              {lead.contactName
                ? lead.contactName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                : <Truck className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {lead.contactName ?? 'Anonymous Mover'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sourceLabel(lead.sourceChannel)} · {format(new Date(lead.createdAt), 'MMM d')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge
              variant={status === 'converted' ? 'default' : 'secondary'}
              className="text-xs capitalize"
            >
              {status}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0"
              onClick={() => setEditing(true)}
              title="Edit candidate"
              data-testid={`button-edit-candidate-${lead.id}`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {vehicle === 'car'
              ? <Car className="w-4 h-4 text-emerald-600" />
              : <Truck className="w-4 h-4 text-emerald-600" />}
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {earnings.label}
            </span>
          </div>
          <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            ${earnings.min}–${earnings.max}/job
          </span>
        </div>

        <div className="space-y-1">
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
        </div>

        {lead.notes && (
          <div className="bg-muted/40 rounded-lg px-2.5 py-2">
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {lead.notes.replace(/https?:\/\/[^\s]+/g, '').replace(/URL:\s*/g, '').trim()}
            </p>
            {listingUrl && (
              <a
                href={listingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1.5"
              >
                <ExternalLink className="w-3 h-3" />
                View listing
              </a>
            )}
          </div>
        )}

        {(lead.touchpoints ?? 0) > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>
              {lead.touchpoints} outreach sent
              {lead.lastTouchedAt && (
                <> · {format(new Date(lead.lastTouchedAt), 'MMM d, h:mm a')}</>
              )}
            </span>
          </div>
        )}

        {!lead.contactEmail && !lead.contactPhone && (
          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-2.5 py-2">
            <Truck className="w-3.5 h-3.5 shrink-0" />
            <span>No contact info — check listing or edit to add details</span>
          </div>
        )}

        <div className="space-y-2 pt-2 border-t">
          <Button
            className="w-full"
            size="sm"
            variant="outline"
            onClick={() => emailMutation.mutate('email')}
            disabled={!savedEmail || emailMutation.isPending || isTerminal}
            data-testid={`button-jordan-email-${lead.id}`}
          >
            {emailMutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Mail className="w-3.5 h-3.5 mr-1.5" />}
            {savedEmail ? 'Send email via Jordan' : 'No email — cannot send'}
          </Button>

          <Button
            className="w-full"
            size="sm"
            variant="outline"
            onClick={() => smsMutation.mutate()}
            disabled={!savedPhone || smsMutation.isPending || isTerminal}
            data-testid={`button-jordan-sms-${lead.id}`}
          >
            {smsMutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <MessageSquare className="w-3.5 h-3.5 mr-1.5" />}
            {savedPhone ? 'Send SMS via Jordan' : 'No phone — cannot send'}
          </Button>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <AgentAvatar agentKey="jordan-hayes" size="sm" />
              <span className="text-xs text-muted-foreground">Jordan Hayes · VETTER</span>
            </div>
            {lead.status !== 'converted' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 px-2"
                onClick={() => convertMutation.mutate()}
                disabled={convertMutation.isPending}
                data-testid={`button-mark-converted-${lead.id}`}
              >
                <Check className="w-3 h-3 mr-1" />
                Mark converted
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

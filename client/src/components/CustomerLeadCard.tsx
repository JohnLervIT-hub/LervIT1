import { useState } from 'react';
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
  Mail, Phone, PhoneOff, User,
  Pencil, X, Check, Copy, ExternalLink,
  MessageSquare, Trash2, Loader2, FileX,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const sourceLabel = (channel: string | null): string => {
  if (!channel) return 'Manual';
  const c = channel.toLowerCase();
  if (c.includes('quote_form') || c === 'quote') return 'Quote form';
  if (c.includes('scout')) return 'Scout signal';
  if (c.includes('reddit')) return 'Reddit';
  if (c.includes('google')) return 'Google Alerts';
  if (c.includes('facebook')) return 'Facebook';
  if (c.includes('referral')) return 'Referral';
  if (c.includes('phone')) return 'Phone call';
  if (c.includes('walk')) return 'Walk-in';
  if (c.includes('manual') || c === 'admin-manual' || c === 'personal') return 'Manual';
  return channel;
};

const statusColor = (status: string): string => ({
  new:       'bg-blue-500',
  contacted: 'bg-amber-500',
  converted: 'bg-emerald-500',
  cold:      'bg-slate-400',
}[status] ?? 'bg-slate-400');

const STATUS_OPTIONS = [
  { value: 'new',       label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'converted', label: 'Booked' },
  { value: 'cold',      label: 'Cold' },
] as const;

interface QuoteDetails {
  price?: string;
  items?: string;
  vehicle?: string;
  distance?: string;
}

function parseQuoteDetails(notes: string | null): QuoteDetails | null {
  if (!notes || !notes.includes('Quote:')) return null;
  return {
    price:    notes.match(/Quote:\s*(\$[\d.,]+(?:\s*CAD)?)/)?.[1],
    items:    notes.match(/Items:\s*([^\n]+)/)?.[1]?.trim(),
    vehicle:  notes.match(/Vehicle:\s*([^\n]+)/)?.[1]?.trim(),
    distance: notes.match(/Distance:\s*([^\n]+)/)?.[1]?.trim(),
  };
}

export interface CustomerLead {
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
  quoteId: string | null;
  createdAt: string;
}

interface CustomerLeadCardProps {
  lead: CustomerLead;
  onRefresh: () => void;
}

export function CustomerLeadCard({ lead, onRefresh }: CustomerLeadCardProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);

  const [editName, setEditName] = useState(lead.contactName ?? '');
  const [editEmail, setEditEmail] = useState(lead.contactEmail ?? '');
  const [editPhone, setEditPhone] = useState(lead.contactPhone ?? '');
  const [editStatus, setEditStatus] = useState(lead.status ?? 'new');
  const [editNotes, setEditNotes] = useState(lead.notes ?? '');

  const status = lead.status ?? 'new';
  const isTerminal = status === 'converted' || status === 'cold';
  const quote = parseQuoteDetails(lead.notes);
  const score = lead.intentScore ?? 0;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ description: `${label} copied` });
  };

  const emailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/agent/alex/trigger', {
        action: 'convert_lead',
        input: { leadId: lead.id, channelOverride: 'email' },
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.result?.skipped) {
        toast({
          title: 'Skipped',
          description: data.result.reason === 'already_contacted_today'
            ? 'Already contacted today'
            : data.result.reason ?? 'No email available',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Alex Morgan',
        description: 'Recovery email queued for ' + (lead.contactName ?? lead.contactEmail ?? 'lead'),
      });
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: 'Send failed', description: err?.message, variant: 'destructive' });
    },
  });

  const smsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/agent/alex/trigger', {
        action: 'convert_lead',
        input: { leadId: lead.id, channelOverride: 'sms' },
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
        title: 'Alex Morgan',
        description: 'SMS queued for ' + (lead.contactPhone ?? 'lead'),
      });
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: 'SMS failed', description: err?.message, variant: 'destructive' });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PATCH', `/api/admin/agent/leads/${lead.id}`, {
        contactName:  editName.trim(),
        contactEmail: editEmail.trim(),
        contactPhone: editPhone.trim(),
        status: editStatus,
        notes: editNotes.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ description: 'Lead updated' });
      setEditing(false);
      onRefresh();
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
      toast({ description: 'Marked as booked' });
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
      toast({ description: 'Lead removed' });
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
            <p className="text-sm font-medium">Edit lead</p>
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
                placeholder="e.g. Sarah Johnson"
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
              <label className="text-xs text-muted-foreground block mb-1">Status</label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Move details</label>
              <Textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="Pickup area, items, preferred date..."
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
                if (confirm('Remove this lead?')) deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
              Delete lead
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden" data-testid={`card-customer-lead-${lead.id}`}>
      <div className={cn('h-1', statusColor(status))} />

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm shrink-0">
              {lead.contactName
                ? lead.contactName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                : <User className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {lead.contactName ?? 'Anonymous Lead'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sourceLabel(lead.sourceChannel)} · {format(new Date(lead.createdAt), 'MMM d')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {status === 'converted' ? (
              <Badge variant="default" className="text-xs">Booked ✓</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs capitalize">{status}</Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0"
              onClick={() => setEditing(true)}
              title="Edit lead"
              data-testid={`button-edit-lead-${lead.id}`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {quote ? (
          <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg px-3 py-2">
            <div className="flex justify-between mb-1">
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                Quote details
              </span>
              {quote.price && (
                <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                  {quote.price}
                </span>
              )}
            </div>
            <div className="space-y-0.5 text-xs text-blue-600 dark:text-blue-300">
              {quote.items && <p>📦 {quote.items}</p>}
              {quote.vehicle && <p>🚛 {quote.vehicle}</p>}
              {quote.distance && <p>📍 {quote.distance}</p>}
            </div>
            {lead.quoteId && (
              <a
                href={`/quote/${lead.quoteId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 mt-1.5"
              >
                <ExternalLink className="w-3 h-3" />
                Open quote link
              </a>
            )}
          </div>
        ) : (
          <div className="bg-muted/40 border border-border rounded-lg px-3 py-2 flex items-center gap-2">
            <FileX className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              No quote captured — manual lead
            </span>
          </div>
        )}

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

        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Intent score</span>
            <span className={cn(
              'font-medium',
              score >= 80 && 'text-emerald-600',
              score >= 60 && score < 80 && 'text-amber-600',
              score < 60 && 'text-muted-foreground',
            )}>
              {score} / 100
            </span>
          </div>
          <div className="h-1 bg-muted rounded-full">
            <div
              className={cn(
                'h-1 rounded-full transition-all',
                score >= 80 && 'bg-emerald-500',
                score >= 60 && score < 80 && 'bg-amber-500',
                score < 60 && 'bg-slate-400',
              )}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
        </div>

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

        <div className="space-y-2 pt-2 border-t">
          <Button
            className="w-full"
            size="sm"
            variant="outline"
            onClick={() => emailMutation.mutate()}
            disabled={!lead.contactEmail || emailMutation.isPending || isTerminal}
            data-testid={`button-alex-email-${lead.id}`}
          >
            {emailMutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Mail className="w-3.5 h-3.5 mr-1.5" />}
            {lead.contactEmail ? 'Send recovery email via Alex' : 'No email — cannot send'}
          </Button>

          <Button
            className="w-full"
            size="sm"
            variant="outline"
            onClick={() => smsMutation.mutate()}
            disabled={!lead.contactPhone || smsMutation.isPending || isTerminal}
            data-testid={`button-alex-sms-${lead.id}`}
          >
            {smsMutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <MessageSquare className="w-3.5 h-3.5 mr-1.5" />}
            {lead.contactPhone ? 'Send SMS via Alex' : 'No phone — cannot send'}
          </Button>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <AgentAvatar agentKey="alex-morgan" size="sm" />
              <span className="text-xs text-muted-foreground">Alex Morgan · CLOSER-D</span>
            </div>
            {status !== 'converted' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 px-2"
                onClick={() => convertMutation.mutate()}
                disabled={convertMutation.isPending}
                data-testid={`button-mark-booked-${lead.id}`}
              >
                <Check className="w-3 h-3 mr-1" />
                Mark booked
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

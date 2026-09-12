import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { AgentAvatar } from '@/components/AgentAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { X, Loader2, UserPlus } from 'lucide-react';

const SOURCE_OPTIONS = [
  { value: 'manual',   label: 'Manual entry' },
  { value: 'reddit',   label: 'Reddit' },
  { value: 'phone',    label: 'Phone call' },
  { value: 'referral', label: 'Referral' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'walk-in',  label: 'Walk-in' },
] as const;

interface AddCustomerLeadCardProps {
  onClose: () => void;
  onRefresh: () => void;
}

export function AddCustomerLeadCard({ onClose, onRefresh }: AddCustomerLeadCardProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [moveDetails, setMoveDetails] = useState('');
  const [source, setSource] = useState<string>('manual');

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/agent/leads', {
        contactName:  name.trim()  || undefined,
        contactEmail: email.trim() || undefined,
        contactPhone: phone.trim() || undefined,
        notes: moveDetails.trim() || null,
        sourceChannel: source,
        leadType: 'customer',
        intentScore: 70,
        status: 'new',
        assignedAgent: 'alex',
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ description: 'Lead added' });
      onClose();
      onRefresh();
    },
    onError: (err: any) => {
      toast({ title: 'Failed to add', description: err?.message, variant: 'destructive' });
    },
  });

  const handleSubmit = () => {
    if (!email.trim() && !phone.trim()) {
      toast({
        title: 'Contact info required',
        description: 'Add at least an email or phone',
        variant: 'destructive',
      });
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="rounded-xl border-2 border-blue-300 dark:border-blue-700 bg-card overflow-hidden">
      <div className="h-1 bg-blue-500" />
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">Add lead</p>
          </div>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-2.5">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Name <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Sarah Johnson"
              className="h-8 text-sm"
              data-testid="input-add-lead-name"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Email</label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@email.com"
              className="h-8 text-sm"
              data-testid="input-add-lead-email"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Phone</label>
            <Input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+1 403-555-0000"
              className="h-8 text-sm"
              data-testid="input-add-lead-phone"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Move details <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <Textarea
              value={moveDetails}
              onChange={e => setMoveDetails(e.target.value)}
              placeholder="Pickup/dropoff area, items, preferred date..."
              rows={2}
              className="text-sm resize-none"
              data-testid="input-add-lead-notes"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Source</label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            className="flex-1"
            size="sm"
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            data-testid="button-add-lead-submit"
          >
            {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Add lead
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <AgentAvatar agentKey="alex-morgan" size="sm" />
          <span className="text-xs text-muted-foreground">
            Alex will pick up on next run
          </span>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          At least email or phone required
        </p>
      </div>
    </div>
  );
}

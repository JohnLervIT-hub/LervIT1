import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { X, Loader2, UserPlus } from 'lucide-react';

const VEHICLE_OPTIONS = [
  { value: 'car',    label: 'SUV / Car ($25–$45/job)' },
  { value: 'pickup', label: 'Pickup Truck ($45–$100/job)' },
  { value: 'van',    label: 'Cargo Van ($55–$150/job)' },
  { value: 'truck',  label: 'Moving Truck ($150–$350/job)' },
] as const;

const VEHICLE_TAG: Record<string, string> = {
  car:    'Vehicle: SUV / Car',
  pickup: 'Vehicle: Pickup Truck',
  van:    'Vehicle: Cargo Van',
  truck:  'Vehicle: Moving Truck',
};

interface AddMoverCandidateCardProps {
  onClose: () => void;
  onRefresh: () => void;
}

export function AddMoverCandidateCard({ onClose, onRefresh }: AddMoverCandidateCardProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicle, setVehicle] = useState('pickup');
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      const combinedNotes = [VEHICLE_TAG[vehicle], notes.trim()].filter(Boolean).join('\n');
      const res = await apiRequest('POST', '/api/admin/agent/leads', {
        contactName:  name.trim()  || undefined,
        contactEmail: email.trim() || undefined,
        contactPhone: phone.trim() || undefined,
        notes: combinedNotes || undefined,
        sourceChannel: 'manual',
        utmCampaign: 'ryan-brooks',
        intentScore: 70,
        status: 'new',
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ description: 'Candidate added' });
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
      <div className="h-1 bg-emerald-500" />
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">Add candidate</p>
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
              placeholder="e.g. John Smith"
              className="h-8 text-sm"
              data-testid="input-add-candidate-name"
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
              data-testid="input-add-candidate-email"
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
              data-testid="input-add-candidate-phone"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Vehicle</label>
            <Select value={vehicle} onValueChange={setVehicle}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VEHICLE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Notes <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Availability, area, listing URL..."
              rows={2}
              className="text-sm resize-none"
              data-testid="input-add-candidate-notes"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            className="flex-1"
            size="sm"
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            data-testid="button-add-candidate-submit"
          >
            {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Add candidate
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          At least email or phone required
        </p>
      </div>
    </div>
  );
}

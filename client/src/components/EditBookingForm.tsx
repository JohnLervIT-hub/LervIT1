import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Save, MapPin, Calendar, Package, Users } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const editBookingSchema = z.object({
  pickupAddress: z.string().min(1, "Pickup address is required"),
  dropoffAddress: z.string().min(1, "Dropoff address is required"),
  preferredDate: z.string().min(1, "Date is required"),
  loadSize: z.enum(["boxes", "medium", "large", "apartment"]),
  pickupDifficulty: z.enum(["ground", "basement", "stairs", "elevator"]),
  dropoffDifficulty: z.enum(["ground", "basement", "stairs", "elevator"]),
  heavyItem: z.boolean(),
  numberOfMovers: z.number().int().min(1).max(2),
  description: z.string().optional(),
});

type EditBookingFormData = z.infer<typeof editBookingSchema>;

interface Booking {
  id: string;
  pickupAddress: string;
  dropoffAddress: string;
  preferredDate: string;
  loadSize: string;
  pickupDifficulty?: string;
  dropoffDifficulty?: string;
  heavyItem?: boolean;
  numberOfMovers?: number;
  description?: string | null;
}

interface EditBookingFormProps {
  booking: Booking;
  onSuccess: () => void;
  onCancel: () => void;
  customerId: string;
}

export default function EditBookingForm({ booking, onSuccess, onCancel, customerId }: EditBookingFormProps) {
  const { toast } = useToast();
  
  const form = useForm<EditBookingFormData>({
    resolver: zodResolver(editBookingSchema),
    defaultValues: {
      pickupAddress: booking.pickupAddress,
      dropoffAddress: booking.dropoffAddress,
      preferredDate: format(new Date(booking.preferredDate), "yyyy-MM-dd'T'HH:mm"),
      loadSize: (booking.loadSize as "boxes" | "medium" | "large" | "apartment") || "medium",
      pickupDifficulty: (booking.pickupDifficulty as "ground" | "basement" | "stairs" | "elevator") || "ground",
      dropoffDifficulty: (booking.dropoffDifficulty as "ground" | "basement" | "stairs" | "elevator") || "ground",
      heavyItem: booking.heavyItem || false,
      numberOfMovers: booking.numberOfMovers || 1,
      description: booking.description || "",
    },
  });

  const editMutation = useMutation({
    mutationFn: async (data: EditBookingFormData) => {
      return apiRequest("PATCH", `/api/bookings/${booking.id}/edit`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/bookings?customerId=${customerId}`] });
      toast({
        title: "Booking updated",
        description: "Your booking has been updated successfully. The price has been recalculated.",
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update booking",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditBookingFormData) => {
    editMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="pickupAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-green-500" />
                Pickup Address
              </FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter pickup address" data-testid="input-edit-pickup" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="dropoffAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Dropoff Address
              </FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter dropoff address" data-testid="input-edit-dropoff" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="preferredDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Preferred Date & Time
              </FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} data-testid="input-edit-date" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="loadSize"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Load Size
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-edit-loadsize">
                      <SelectValue placeholder="Select load size" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="boxes">Boxes (1-10 ft³)</SelectItem>
                    <SelectItem value="medium">Medium (11-50 ft³)</SelectItem>
                    <SelectItem value="large">Large (50-170 ft³)</SelectItem>
                    <SelectItem value="apartment">Apartment (170+ ft³)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="numberOfMovers"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Number of Movers
                </FormLabel>
                <Select 
                  onValueChange={(val) => field.onChange(parseInt(val))} 
                  value={field.value.toString()}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-edit-movers">
                      <SelectValue placeholder="Select movers" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="1">1 Mover</SelectItem>
                    <SelectItem value="2">2 Movers (+30%)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="pickupDifficulty"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pickup Access</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-edit-pickup-difficulty">
                      <SelectValue placeholder="Select access type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="ground">Ground Floor</SelectItem>
                    <SelectItem value="basement">Basement (+$10)</SelectItem>
                    <SelectItem value="stairs">Stairs (+$5)</SelectItem>
                    <SelectItem value="elevator">Elevator (+$8)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dropoffDifficulty"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dropoff Access</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-edit-dropoff-difficulty">
                      <SelectValue placeholder="Select access type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="ground">Ground Floor</SelectItem>
                    <SelectItem value="basement">Basement (+$10)</SelectItem>
                    <SelectItem value="stairs">Stairs (+$5)</SelectItem>
                    <SelectItem value="elevator">Elevator (+$8)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="heavyItem"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Heavy Items</FormLabel>
                <p className="text-sm text-muted-foreground">
                  Items over 100 lbs requiring special handling
                </p>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="switch-edit-heavy"
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Additional Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea 
                  {...field} 
                  placeholder="Any special instructions for the mover..."
                  className="resize-none"
                  data-testid="textarea-edit-description"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3 pt-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            className="flex-1"
            data-testid="button-edit-cancel"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={editMutation.isPending}
            className="flex-1"
            data-testid="button-edit-save"
          >
            {editMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
        
        <p className="text-xs text-muted-foreground text-center">
          Price will be automatically recalculated based on your changes
        </p>
      </form>
    </Form>
  );
}

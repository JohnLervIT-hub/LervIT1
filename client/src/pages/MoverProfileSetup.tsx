import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Upload, Truck, User } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

const VEHICLE_TYPES = ["Car", "SUV", "Pickup", "Cargo Van", "Cube Truck", "Flatbed"];

const profileSchema = z.object({
  vehicleType: z.string().min(1, "Vehicle type is required"),
  vehicleColor: z.string().optional(),
  licensePlate: z.string().optional(),
  bio: z.string().max(500, "Bio must be 500 characters or less").optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function MoverProfileSetup() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [moverImageFile, setMoverImageFile] = useState<File | null>(null);
  const [moverImagePreview, setMoverImagePreview] = useState<string | null>(null);
  const [vehiclePhotoFile, setVehiclePhotoFile] = useState<File | null>(null);
  const [vehiclePhotoPreview, setVehiclePhotoPreview] = useState<string | null>(null);

  // Fetch current mover profile
  const { data: mover, isLoading } = useQuery<any>({
    queryKey: [`/api/movers?userId=${user?.id}`],
    enabled: !!user?.id,
    select: (data) => (Array.isArray(data) ? data[0] : data),
  });

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      vehicleType: "",
      vehicleColor: "",
      licensePlate: "",
      bio: "",
    },
  });

  // Reset form with mover data when it loads
  useEffect(() => {
    if (mover) {
      form.reset({
        vehicleType: mover.vehicleType || "",
        vehicleColor: mover.vehicleColor || "",
        licensePlate: mover.licensePlate || "",
        bio: mover.bio || "",
      });
      
      // Set image previews if they exist
      if (mover.moverImage) {
        setMoverImagePreview(mover.moverImage);
      }
      if (mover.vehiclePhoto) {
        setVehiclePhotoPreview(mover.vehiclePhoto);
      }
    }
  }, [mover, form]);

  // Upload images mutation
  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("photo", file);
      const response = await fetch("/api/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      return response.json();
    },
  });

  // Update mover profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: {
      vehicleType?: string;
      vehicleColor?: string;
      licensePlate?: string;
      bio?: string;
      moverImage?: string;
      vehiclePhoto?: string;
    }) => {
      return apiRequest("PATCH", `/api/movers/${mover.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/movers?userId=${user?.id}`] });
      toast({
        title: "Profile updated",
        description: "Your mover profile has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleMoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMoverImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setMoverImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVehiclePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVehiclePhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setVehiclePhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: ProfileFormData) => {
    try {
      let moverImageUrl = mover?.moverImage;
      let vehiclePhotoUrl = mover?.vehiclePhoto;

      // Upload mover image if new file selected
      if (moverImageFile) {
        const result = await uploadImageMutation.mutateAsync(moverImageFile);
        moverImageUrl = result.url;
      }

      // Upload vehicle photo if new file selected
      if (vehiclePhotoFile) {
        const result = await uploadImageMutation.mutateAsync(vehiclePhotoFile);
        vehiclePhotoUrl = result.url;
      }

      // Update mover profile
      await updateProfileMutation.mutateAsync({
        ...data,
        moverImage: moverImageUrl,
        vehiclePhoto: vehiclePhotoUrl,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload images or update profile.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!mover) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="p-6 text-center">
            <p className="text-muted-foreground">
              No mover profile found. Please contact support.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Mover Profile</h1>
          <p className="text-muted-foreground">
            Update your profile details and vehicle information
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Profile Photo Section */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-xl font-semibold">Profile Photo</h2>
                </div>

                <div className="flex items-center gap-6">
                  <Avatar className="w-24 h-24">
                    <AvatarImage
                      src={moverImagePreview || mover.moverImage || undefined}
                      alt="Profile photo"
                    />
                    <AvatarFallback className="text-2xl">
                      {user?.name.split(" ").map((n) => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1">
                    <Label htmlFor="mover-image" className="cursor-pointer">
                      <div className="flex items-center gap-2 px-4 py-2 border rounded-md hover-elevate active-elevate-2 inline-flex">
                        <Upload className="w-4 h-4" />
                        <span className="text-sm">Upload Photo</span>
                      </div>
                      <Input
                        id="mover-image"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleMoverImageChange}
                        data-testid="input-mover-image"
                      />
                    </Label>
                    <p className="text-xs text-muted-foreground mt-2">
                      Recommended: Clear headshot photo
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Bio Section */}
            <Card className="p-6">
              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Tell customers about your experience and services..."
                        className="min-h-24"
                        data-testid="input-bio"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Card>

            {/* Vehicle Information Section */}
            <Card className="p-6">
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-4">
                  <Truck className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-xl font-semibold">Vehicle Information</h2>
                </div>

                <FormField
                  control={form.control}
                  name="vehicleType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vehicle Type *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-vehicle-type">
                            <SelectValue placeholder="Select vehicle type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {VEHICLE_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="vehicleColor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vehicle Color</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., White, Black, Red"
                          data-testid="input-vehicle-color"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="licensePlate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>License Plate</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., ABC123"
                          data-testid="input-license-plate"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Vehicle Photo */}
                <div className="space-y-2">
                  <Label htmlFor="vehicle-photo">Vehicle Photo</Label>
                  {(vehiclePhotoPreview || mover.vehiclePhoto) && (
                    <img
                      src={vehiclePhotoPreview || mover.vehiclePhoto}
                      alt="Vehicle"
                      className="w-full max-w-md h-48 object-cover rounded-md border"
                    />
                  )}
                  <Label htmlFor="vehicle-photo" className="cursor-pointer">
                    <div className="flex items-center gap-2 px-4 py-2 border rounded-md hover-elevate active-elevate-2 inline-flex">
                      <Upload className="w-4 h-4" />
                      <span className="text-sm">Upload Vehicle Photo</span>
                    </div>
                    <Input
                      id="vehicle-photo"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleVehiclePhotoChange}
                      data-testid="input-vehicle-photo"
                    />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Clear photo of your vehicle for customers
                  </p>
                </div>
              </div>
            </Card>

            {/* Submit Button */}
            <div className="flex justify-end gap-3">
              <Button
                type="submit"
                disabled={updateProfileMutation.isPending || uploadImageMutation.isPending}
                data-testid="button-save-profile"
              >
                {(updateProfileMutation.isPending || uploadImageMutation.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Save Profile
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}

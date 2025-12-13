import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Camera, Truck, FileText, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

interface ProfileCompletionCardProps {
  mover: {
    profilePhoto?: string | null;
    vehicleType?: string | null;
    bio?: string | null;
  } | null;
}

export function ProfileCompletionCard({ mover }: ProfileCompletionCardProps) {
  const [, setLocation] = useLocation();

  const completionItems = [
    {
      id: "photo",
      label: "Add a profile photo",
      description: "Help customers recognize you",
      icon: Camera,
      isComplete: !!mover?.profilePhoto,
    },
    {
      id: "vehicle",
      label: "Add vehicle details",
      description: "Show what you can transport",
      icon: Truck,
      isComplete: !!mover?.vehicleType,
    },
    {
      id: "bio",
      label: "Write a bio",
      description: "Tell customers about yourself",
      icon: FileText,
      isComplete: !!mover?.bio,
    },
  ];

  const completedCount = completionItems.filter(item => item.isComplete).length;
  const totalCount = completionItems.length;
  const completionPercentage = Math.round((completedCount / totalCount) * 100);
  const isComplete = completedCount === totalCount;

  if (isComplete) {
    return null;
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent" data-testid="card-profile-completion">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Complete Your Profile</CardTitle>
            <CardDescription>
              Get more job offers with a complete profile
            </CardDescription>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-primary">{completionPercentage}%</span>
          </div>
        </div>
        <Progress value={completionPercentage} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        {completionItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                item.isComplete ? "bg-green-500/10" : "bg-muted/50"
              }`}
              data-testid={`profile-item-${item.id}`}
            >
              <div className={`p-1.5 rounded-full ${item.isComplete ? "bg-green-500/20" : "bg-muted"}`}>
                <Icon className={`w-4 h-4 ${item.isComplete ? "text-green-600" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${item.isComplete ? "text-green-600" : ""}`}>
                  {item.label}
                </p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              {item.isComplete ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground/40" />
              )}
            </div>
          );
        })}

        <Button 
          className="w-full mt-4" 
          onClick={() => setLocation("/mover-profile")}
          data-testid="button-edit-profile"
        >
          Edit Profile
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}

export default ProfileCompletionCard;

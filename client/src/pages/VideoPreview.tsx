import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Video, Users, Truck } from "lucide-react";
import customerVideo from "@assets/generated_videos/customer_lifecycle_moving_journey.mp4";
import moverVideo from "@assets/generated_videos/mover_lifecycle_job_journey.mp4";

export default function VideoPreview() {
  return (
    <div className="min-h-screen bg-background pt-20 px-4 pb-4 md:pt-24 md:px-8 md:pb-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold flex items-center justify-center gap-3">
            <Video className="w-10 h-10 text-primary" />
            LervIT Demo Videos Preview
          </h1>
          <p className="text-lg text-muted-foreground">
            Review the HD lifecycle demo videos before publishing
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Customer Lifecycle Journey
              </CardTitle>
              <CardDescription>
                8 seconds • 1080p HD • 16:9 Landscape
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video 
                  src={customerVideo} 
                  controls 
                  className="w-full h-full"
                  data-testid="video-customer-lifecycle"
                >
                  Your browser does not support the video tag.
                </video>
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-semibold">Story Flow:</p>
                <ul className="space-y-1 text-muted-foreground ml-4">
                  <li>• Woman requests move on smartphone</li>
                  <li>• Browses mover profiles with ratings</li>
                  <li>• Books mover with one tap</li>
                  <li>• Tracks delivery in real-time</li>
                  <li>• Mover arrives and loads items</li>
                  <li>• Successful delivery at new home</li>
                  <li>• Leaves 5-star review</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary" />
                Mover Lifecycle Journey
              </CardTitle>
              <CardDescription>
                8 seconds • 1080p HD • 16:9 Landscape
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video 
                  src={moverVideo} 
                  controls 
                  className="w-full h-full"
                  data-testid="video-mover-lifecycle"
                >
                  Your browser does not support the video tag.
                </video>
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-semibold">Story Flow:</p>
                <ul className="space-y-1 text-muted-foreground ml-4">
                  <li>• Mover receives job notification</li>
                  <li>• Reviews $53 earnings details</li>
                  <li>• Accepts booking</li>
                  <li>• Drives truck to pickup</li>
                  <li>• Greets customer and loads items</li>
                  <li>• Delivers to new location</li>
                  <li>• Receives payment confirmation</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="w-5 h-5" />
              Video Specifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="font-semibold mb-1">Duration</p>
                <p className="text-muted-foreground">8 seconds each</p>
              </div>
              <div>
                <p className="font-semibold mb-1">Resolution</p>
                <p className="text-muted-foreground">1080p HD</p>
              </div>
              <div>
                <p className="font-semibold mb-1">Aspect Ratio</p>
                <p className="text-muted-foreground">16:9 Landscape</p>
              </div>
              <div>
                <p className="font-semibold mb-1">Features</p>
                <p className="text-muted-foreground">Real people & artifacts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" variant="outline" asChild>
            <a href="/" data-testid="button-back-home">
              Back to Home
            </a>
          </Button>
          <Button size="lg" asChild>
            <a href="/demo" data-testid="button-view-demos">
              View Interactive Demos
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

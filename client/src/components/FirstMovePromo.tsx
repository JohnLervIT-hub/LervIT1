import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, ArrowRight, Sparkles, Truck, Clock, Shield } from "lucide-react";
import { useLocation } from "wouter";

interface FirstMovePromoProps {
  userName: string;
}

export function FirstMovePromo({ userName }: FirstMovePromoProps) {
  const [, setLocation] = useLocation();
  const firstName = userName.split(" ")[0];

  return (
    <Card className="relative overflow-hidden border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-primary/10 to-accent/5" data-testid="card-first-move-promo">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-accent/10 rounded-full translate-y-1/2 -translate-x-1/2" />
      
      <CardContent className="relative p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Gift className="w-7 h-7 text-primary" />
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-bold text-lg">Welcome, {firstName}!</h3>
              <Badge className="bg-green-500 text-white">
                <Sparkles className="w-3 h-3 mr-1" />
                10% OFF
              </Badge>
            </div>
            
            <p className="text-muted-foreground mb-4">
              As a new customer, you get <span className="font-semibold text-green-600 dark:text-green-400">10% off your first move</span>. 
              Book now and experience Calgary's smartest moving service!
            </p>

            <div className="flex flex-wrap gap-3 mb-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Truck className="w-4 h-4" />
                <span>Verified movers</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>Instant quotes</span>
              </div>
              <div className="flex items-center gap-1">
                <Shield className="w-4 h-4" />
                <span>Secure payment</span>
              </div>
            </div>

            <Button 
              onClick={() => setLocation("/request-move")}
              className="w-full sm:w-auto"
              data-testid="button-book-first-move"
            >
              Book Your First Move
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default FirstMovePromo;

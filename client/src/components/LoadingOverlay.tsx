import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface LoadingOverlayProps {
  isVisible: boolean;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

export function LoadingOverlay({ 
  isVisible, 
  title = "Processing...", 
  subtitle,
  icon 
}: LoadingOverlayProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          data-testid="loading-overlay"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-card border border-card-border rounded-2xl p-8 shadow-xl max-w-sm mx-4 text-center"
          >
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
              <div className="relative bg-gradient-to-br from-primary/10 to-primary/5 rounded-full p-4 inline-flex">
                {icon || <Loader2 className="h-10 w-10 animate-spin text-primary" />}
              </div>
            </div>
            <h3 className="font-semibold text-lg mb-1">{title}</h3>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function VisionProcessingOverlay({ isVisible }: { isVisible: boolean }) {
  return (
    <LoadingOverlay
      isVisible={isVisible}
      title="Analyzing Your Items"
      subtitle="Our AI is identifying dimensions, weight, and vehicle requirements"
      icon={
        <div className="relative">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 bg-primary rounded-full animate-ping" />
          </div>
        </div>
      }
    />
  );
}

export function PaymentProcessingOverlay({ isVisible }: { isVisible: boolean }) {
  return (
    <LoadingOverlay
      isVisible={isVisible}
      title="Processing Payment"
      subtitle="Please wait while we securely process your payment"
    />
  );
}

export function BookingCreatingOverlay({ isVisible }: { isVisible: boolean }) {
  return (
    <LoadingOverlay
      isVisible={isVisible}
      title="Creating Your Booking"
      subtitle="Calculating distance and finding available movers"
    />
  );
}

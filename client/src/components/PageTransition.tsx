import { lazy, Suspense } from "react";

/**
 * PageTransition - Lightweight wrapper with optional animations
 * Framer-motion is lazy-loaded to avoid blocking initial render
 * Falls back to simple CSS transitions if motion not yet loaded
 */

interface PageTransitionProps {
  children: React.ReactNode;
}

// Lazy load framer-motion - it's ~50KB and not needed for first paint
const MotionWrapper = lazy(() => 
  import("framer-motion").then(mod => ({
    default: ({ children }: { children: React.ReactNode }) => {
      const { motion, AnimatePresence } = mod;
      return (
        <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="w-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      );
    }
  }))
);

// Simple CSS fallback while motion loads
function SimpleFallback({ children }: { children: React.ReactNode }) {
  return <div className="w-full animate-in fade-in duration-150">{children}</div>;
}

export function PageTransition({ children }: PageTransitionProps) {
  return (
    <Suspense fallback={<SimpleFallback>{children}</SimpleFallback>}>
      <MotionWrapper>{children}</MotionWrapper>
    </Suspense>
  );
}

// Re-export animation utilities as lazy-loaded
export const FadeIn = lazy(() => 
  import("framer-motion").then(mod => ({
    default: ({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) => (
      <mod.motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay, ease: "easeOut" }}
        className={className}
      >
        {children}
      </mod.motion.div>
    )
  }))
);

export const ScaleIn = lazy(() => 
  import("framer-motion").then(mod => ({
    default: ({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) => (
      <mod.motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, delay, ease: "easeOut" }}
        className={className}
      >
        {children}
      </mod.motion.div>
    )
  }))
);

export const SlideIn = lazy(() => 
  import("framer-motion").then(mod => ({
    default: ({ children, direction = "left", delay = 0, className = "" }: { children: React.ReactNode; direction?: "left" | "right" | "up" | "down"; delay?: number; className?: string }) => {
      const directionMap = {
        left: { x: -20, y: 0 },
        right: { x: 20, y: 0 },
        up: { x: 0, y: -20 },
        down: { x: 0, y: 20 },
      };
      const initial = directionMap[direction];
      return (
        <mod.motion.div
          initial={{ opacity: 0, ...initial }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 0.3, delay, ease: "easeOut" }}
          className={className}
        >
          {children}
        </mod.motion.div>
      );
    }
  }))
);

export const StaggerChildren = lazy(() => 
  import("framer-motion").then(mod => ({
    default: ({ children, staggerDelay = 0.05, className = "" }: { children: React.ReactNode; staggerDelay?: number; className?: string }) => (
      <mod.motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: staggerDelay } },
        }}
        className={className}
      >
        {children}
      </mod.motion.div>
    )
  }))
);

export const StaggerItem = lazy(() => 
  import("framer-motion").then(mod => ({
    default: ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
      <mod.motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          visible: { opacity: 1, y: 0 },
        }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={className}
      >
        {children}
      </mod.motion.div>
    )
  }))
);

export const PulseOnHover = lazy(() => 
  import("framer-motion").then(mod => ({
    default: ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
      <mod.motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        className={className}
      >
        {children}
      </mod.motion.div>
    )
  }))
);

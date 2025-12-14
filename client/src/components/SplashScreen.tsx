import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import lervitLogo from "@assets/openart-image_1SFSt-ER_1764093553852_raw_1764100691621.jpg";

interface SplashScreenProps {
  onComplete: () => void;
  minDisplayTime?: number;
}

export default function SplashScreen({ onComplete, minDisplayTime = 2000 }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, minDisplayTime);

    return () => clearTimeout(timer);
  }, [minDisplayTime]);

  useEffect(() => {
    if (isReady) {
      const fadeTimer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onComplete, 500);
      }, 300);
      return () => clearTimeout(fadeTimer);
    }
  }, [isReady, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white"
          data-testid="splash-screen"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex flex-col items-center gap-8"
          >
            <motion.img
              src={lervitLogo}
              alt="LervIT - Smart Moving Solutions"
              className="w-72 sm:w-80 md:w-96 h-auto"
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
            
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-3xl sm:text-4xl font-bold text-gray-900"
            >
              LervIT
            </motion.h1>
            
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2.5 h-2.5 rounded-full bg-blue-600"
                    animate={{
                      scale: [1, 1.3, 1],
                      opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
              <motion.p
                className="text-sm text-gray-500 font-medium"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                Loading...
              </motion.p>
            </motion.div>
          </motion.div>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="absolute bottom-8 text-xs text-gray-400"
          >
            Calgary's Smart Moving Platform
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

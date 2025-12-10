import { useEffect } from "react";
import { useLocation } from "wouter";

export function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return null;
}

export function scrollToTop(smooth: boolean = true) {
  window.scrollTo({ 
    top: 0, 
    behavior: smooth ? "smooth" : "instant" 
  });
}

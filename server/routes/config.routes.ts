import type { Express } from "express";
import { Request, Response, formatPhoneNumber } from "./shared";

export function registerConfigRoutes(app: Express): void {
  app.get("/api/config/support-phone", (_req: Request, res: Response) => {
    const phoneNumber = process.env.TELNYX_PHONE_NUMBER || "";
    res.json({ 
      phoneNumber: phoneNumber,
      formattedPhone: phoneNumber ? formatPhoneNumber(phoneNumber) : "1-833-LERVIT"
    });
  });
  
  app.get("/api/config/stripe-public-key", (_req: Request, res: Response) => {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const testKey = process.env.TESTING_VITE_STRIPE_PUBLIC_KEY;
    const liveKey = process.env.VITE_STRIPE_PUBLIC_KEY;
    const publicKey = isDevelopment && testKey ? testKey : liveKey;
    
    res.json({ 
      publicKey: publicKey || '',
      isTestMode: isDevelopment && !!testKey
    });
  });

  app.get("/api/places/autocomplete", async (req: Request, res: Response) => {
    try {
      const { input, sessiontoken } = req.query;
      
      if (!input || typeof input !== 'string') {
        return res.status(400).json({ error: "Input parameter is required" });
      }
      
      if (input.length < 3) {
        return res.json({ predictions: [] });
      }
      
      const sanitizedInput = input.trim().slice(0, 200);
      const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.error("Google Maps API key not configured");
        return res.status(500).json({ error: "Service not configured" });
      }
      
      const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
      url.searchParams.set('input', sanitizedInput);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('components', 'country:ca');
      url.searchParams.set('types', 'address');
      url.searchParams.set('language', 'en');
      
      if (sessiontoken && typeof sessiontoken === 'string') {
        url.searchParams.set('sessiontoken', sessiontoken);
      }
      
      const response = await fetch(url.toString());
      if (!response.ok) {
        console.error("Google Places API error:", response.status, response.statusText);
        return res.status(502).json({ error: "Failed to fetch predictions" });
      }
      
      const data = await response.json();
      
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error("Google Places API returned:", data.status, data.error_message);
        return res.status(502).json({ error: "Service error" });
      }
      
      res.json({ 
        predictions: data.predictions || [],
        status: data.status 
      });
    } catch (error) {
      console.error("Places autocomplete proxy error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { useGoogleMaps } from "@/contexts/GoogleMapsContext";

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string, placeDetails?: google.maps.places.PlaceResult) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "data-testid"?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Enter address",
  className = "",
  id,
  "data-testid": dataTestId,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [inputValue, setInputValue] = useState(value);
  
  // Lazy load Google Maps API when this component is used
  const { isLoaded: mapsLoaded } = useGoogleMaps();

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (!inputRef.current || !mapsLoaded || !window.google) return;

    // Initialize Google Places Autocomplete
    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      types: ["address"],
      componentRestrictions: { country: "ca" }, // Restrict to Canada
      bounds: {
        // Calgary bounding box for better suggestions
        north: 51.2,
        south: 50.8,
        east: -113.8,
        west: -114.3,
      },
      fields: ["formatted_address", "geometry", "address_components", "place_id"],
    });

    // Listen for place selection
    const listener = autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current?.getPlace();
      
      if (place && place.formatted_address) {
        setInputValue(place.formatted_address);
        onChange(place.formatted_address, place);
      }
    });

    return () => {
      if (listener) {
        google.maps.event.removeListener(listener);
      }
    };
  }, [onChange, mapsLoaded]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue); // Also update parent for manual entry
  };

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
      <Input
        ref={inputRef}
        id={id}
        placeholder={placeholder}
        className={`pl-10 h-12 ${className}`}
        value={inputValue}
        onChange={handleInputChange}
        data-testid={dataTestId}
      />
    </div>
  );
}

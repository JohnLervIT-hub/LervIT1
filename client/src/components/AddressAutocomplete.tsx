import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string, placeDetails?: google.maps.places.PlaceResult) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "data-testid"?: string;
}

// Debounce hook to limit API calls
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
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
  // Track when autocomplete just fired to avoid duplicate onChange calls
  const autocompleteJustFired = useRef(false);
  
  // Debounce parent onChange to reduce unnecessary updates during typing
  const debouncedInputValue = useDebounce(inputValue, 300);

  useEffect(() => {
    setInputValue(value);
  }, [value]);
  
  // Notify parent of debounced changes for manual entry
  useEffect(() => {
    // Skip if autocomplete just fired (it already called onChange)
    if (autocompleteJustFired.current) {
      autocompleteJustFired.current = false;
      return;
    }
    // Only update parent if value actually differs
    if (debouncedInputValue !== value) {
      onChange(debouncedInputValue);
    }
  }, [debouncedInputValue, value, onChange]);

  useEffect(() => {
    if (!inputRef.current || !window.google) return;

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
        // Mark that autocomplete just fired to prevent double onChange
        autocompleteJustFired.current = true;
        setInputValue(place.formatted_address);
        onChange(place.formatted_address, place);
      }
    });

    return () => {
      if (listener) {
        google.maps.event.removeListener(listener);
      }
    };
  }, [onChange]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    // Parent onChange is now debounced via useEffect above
  }, []);

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

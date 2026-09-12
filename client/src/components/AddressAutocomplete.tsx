import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  // Latest typed value, readable inside the place_changed listener closure
  const inputValueRef = useRef(inputValue);
  const { toast } = useToast();

  // Debounce parent onChange to reduce unnecessary updates during typing
  const debouncedInputValue = useDebounce(inputValue, 300);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);
  
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
      componentRestrictions: { country: "ca" },
      fields: ["formatted_address", "geometry", "address_components", "place_id"],
      types: ["address"],
      bounds: new google.maps.LatLngBounds(
        new google.maps.LatLng(50.84, -114.27), // SW Calgary
        new google.maps.LatLng(51.21, -113.90), // NE Calgary
      ),
      strictBounds: false,
    });

    // Listen for place selection
    const listener = autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current?.getPlace();

      if (place && place.formatted_address) {
        autocompleteJustFired.current = true;
        const typedValue = inputValueRef.current;

        // Validate place has geometry (real result)
        if (!place.geometry?.location) {
          // No geometry = Google couldn't resolve; keep user's typed text
          onChange(typedValue, undefined);
          return;
        }

        // Check if Google returned a wildly different address than typed
        const typedNumber = typedValue.match(/^\d+/)?.[0];
        const returnedNumber = place.formatted_address.match(/^\d+/)?.[0];

        if (typedNumber && returnedNumber && typedNumber !== returnedNumber) {
          // Street numbers don't match — Google substituted a different address
          console.warn("Google Places returned different address:", {
            typed: typedValue,
            returned: place.formatted_address,
          });
          setInputValue(place.formatted_address);
          onChange(place.formatted_address, place);
          toast({
            title: "Address adjusted",
            description: `Google returned "${place.formatted_address}" — please confirm this is correct.`,
            variant: "destructive",
          });
        } else {
          setInputValue(place.formatted_address);
          onChange(place.formatted_address, place);
        }
      }
    });

    return () => {
      if (listener) {
        google.maps.event.removeListener(listener);
      }
    };
  }, [onChange, toast]);

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

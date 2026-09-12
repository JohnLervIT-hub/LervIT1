import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGoogleMaps } from "@/contexts/GoogleMapsContext";
import { useToast } from "@/hooks/use-toast";

interface Prediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface CustomAddressInputProps {
  value: string;
  onChange: (address: string, placeDetails?: google.maps.places.PlaceResult) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "data-testid"?: string;
}

function generateSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/** Strip Canadian postal codes and trailing ", Canada" so the displayed
 *  address reads "45 Setonstone Manor SE, Calgary, AB" instead of the
 *  fully-qualified Google form. Exported so restore paths in RequestMove
 *  can sanitize addresses coming from URL params, quotes, drafts, and
 *  reverse-geocode lookups — all of which bypass this component's
 *  selection-time cleaning. */
export function cleanAddress(addr: string): string {
  return addr
    .replace(/,?\s*[A-Z]\d[A-Z]\s*\d[A-Z]\d/g, '')
    .replace(/,?\s*Canada\s*$/i, '')
    .replace(/,\s*$/, '')
    .trim();
}

export function CustomAddressInput({
  value,
  onChange,
  placeholder = "Enter address",
  className = "",
  id,
  "data-testid": dataTestId,
}: CustomAddressInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const sessionTokenRef = useRef<string>(generateSessionToken());
  const debounceTimerRef = useRef<NodeJS.Timeout>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Monotonic counter that invalidates in-flight selections when the user
  // types more characters or picks a different suggestion mid-fetch.
  const selectionIdRef = useRef(0);
  const { isLoaded: mapsLoaded, loadMaps } = useGoogleMaps();
  const { toast } = useToast();

  useEffect(() => {
    loadMaps();
  }, [loadMaps]);

  useEffect(() => {
    // Safety net: any address arriving via prop (restore paths, external
    // state writes) is sanitized before it hits the display, so postal
    // codes and ", Canada" never leak into the visible field.
    setInputValue(value ? cleanAddress(value) : '');
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchPredictions = useCallback(async (input: string) => {
    if (!input.trim() || input.length < 3) {
      setPredictions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(input)}&sessiontoken=${sessionTokenRef.current}`);
      
      if (!response.ok) throw new Error('Failed to fetch predictions');

      const data = await response.json();
      
      if (data.predictions && data.predictions.length > 0) {
        setPredictions(data.predictions);
        setIsOpen(true);
      } else {
        setPredictions([]);
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Error fetching predictions:', error);
      setPredictions([]);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setSelectedIndex(-1);
    // Invalidate any in-flight selection so its stale onChange is discarded.
    selectionIdRef.current++;
    onChange(newValue);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchPredictions(newValue);
    }, 300);
  };

  const handleSelectPrediction = async (prediction: Prediction) => {
    // Claim a selection id up-front; keystrokes and later selections bump the
    // ref, so we can detect and discard our own result if it lands stale.
    const thisSelectionId = ++selectionIdRef.current;
    const typedValue = inputValue;
    setIsOpen(false);
    setPredictions([]);
    setIsLoading(true);

    const isStale = () => thisSelectionId !== selectionIdRef.current;

    try {
      const PlaceClass = mapsLoaded && window.google?.maps?.places
        ? (window.google.maps.places as any).Place
        : null;

      if (!PlaceClass) {
        // Maps script not ready — return cleaned address string only, no coords.
        if (isStale()) return;
        const fallbackAddress = cleanAddress(prediction.description);
        setInputValue(fallbackAddress);
        onChange(fallbackAddress);
        sessionTokenRef.current = generateSessionToken();
        return;
      }

      const place = new PlaceClass({ id: prediction.place_id });
      await place.fetchFields({
        fields: ['formattedAddress', 'location', 'addressComponents', 'id'],
      });

      // Race guard: user typed / picked something else while fetchFields ran.
      if (isStale()) return;

      const resolvedAddress = cleanAddress(place.formattedAddress || prediction.description);

      // Guard 1: refuse selections without geometry — parent needs coords to proceed.
      if (!place.location) {
        setInputValue(resolvedAddress);
        onChange(resolvedAddress, undefined);
        sessionTokenRef.current = generateSessionToken();
        return;
      }

      const placeResult: google.maps.places.PlaceResult = {
        formatted_address: resolvedAddress,
        place_id: place.id || prediction.place_id,
        geometry: { location: place.location } as google.maps.places.PlaceGeometry,
        address_components: place.addressComponents?.map((c: any) => ({
          long_name: c.longText || '',
          short_name: c.shortText || '',
          types: c.types || [],
        })),
      };

      // Guard 2: warn only when Google's structured street_number differs from
      // what the user typed. Uses address_components (reliable) rather than a
      // regex on the formatted string (misses formatting-only differences).
      const returnedStreetNumber = placeResult.address_components
        ?.find(c => c.types.includes('street_number'))?.long_name ?? null;
      const typedNumber = typedValue.trim().match(/^\d+/)?.[0];
      const numberMismatch =
        !!typedNumber && !!returnedStreetNumber && typedNumber !== returnedStreetNumber;

      setInputValue(resolvedAddress);
      onChange(resolvedAddress, placeResult);

      if (numberMismatch) {
        toast({
          title: "Confirm your address",
          description: `Selected: "${resolvedAddress}" — tap confirm if correct, or retype to search again.`,
        });
      }

      sessionTokenRef.current = generateSessionToken();
    } catch (error) {
      console.error('Error fetching place details:', error);
      if (isStale()) return;
      const fallbackAddress = cleanAddress(prediction.description);
      setInputValue(fallbackAddress);
      onChange(fallbackAddress);
    } finally {
      if (thisSelectionId === selectionIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || predictions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => prev < predictions.length - 1 ? prev + 1 : prev);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < predictions.length) {
          handleSelectPrediction(predictions[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleClear = () => {
    setInputValue('');
    setPredictions([]);
    setIsOpen(false);
    onChange('');
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10 pointer-events-none" />
        <Input
          id={id}
          placeholder={placeholder}
          className={cn("pl-10 pr-10 h-12", className)}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (predictions.length > 0) setIsOpen(true);
          }}
          data-testid={dataTestId}
          autoComplete="off"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          {inputValue && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="hover-elevate active-elevate-2 p-1 rounded-sm"
              data-testid={`${dataTestId}-clear`}
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {isOpen && predictions.length > 0 && (
        <div
          className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg overflow-hidden"
          data-testid={`${dataTestId}-dropdown`}
        >
          <div className="max-h-[300px] overflow-y-auto">
            {predictions.map((prediction, index) => (
              <button
                key={prediction.place_id}
                type="button"
                onClick={() => handleSelectPrediction(prediction)}
                className={cn(
                  "w-full px-4 py-3 text-left flex items-start gap-3 transition-colors",
                  "hover-elevate active-elevate-2",
                  selectedIndex === index && "bg-accent"
                )}
                data-testid={`${dataTestId}-option-${index}`}
              >
                <MapPin className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {prediction.structured_formatting.main_text}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {prediction.structured_formatting.secondary_text}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

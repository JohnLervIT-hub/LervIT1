import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGoogleMaps } from "@/contexts/GoogleMapsContext";

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

// Generate session token for billing optimization
function generateSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
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
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const { isLoaded } = useGoogleMaps();

  // Initialize Places Service for getting place details (only when Google Maps is loaded)
  useEffect(() => {
    if (!isLoaded || !window.google) return;
    
    // Create a hidden div element for PlacesService
    const div = document.createElement('div');
    placesServiceRef.current = new google.maps.places.PlacesService(div);
  }, [isLoaded]);

  // Sync with parent value
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch predictions from Google Places API
  const fetchPredictions = useCallback(async (input: string) => {
    if (!input.trim() || input.length < 3) {
      setPredictions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);

    try {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
      
      url.searchParams.append('input', input);
      url.searchParams.append('key', apiKey);
      url.searchParams.append('types', 'address');
      url.searchParams.append('components', 'country:ca');
      url.searchParams.append('sessiontoken', sessionTokenRef.current);
      
      // Bias to Calgary
      url.searchParams.append('location', '51.0447,-114.0719');
      url.searchParams.append('radius', '50000');

      // Note: Direct API calls from browser will fail due to CORS
      // We need to proxy through our backend
      const response = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(input)}&sessiontoken=${sessionTokenRef.current}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch predictions');
      }

      const data = await response.json();
      
      if (data.predictions) {
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

  // Debounced input handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setSelectedIndex(-1);
    onChange(newValue); // Update parent for manual entry

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer for API call
    debounceTimerRef.current = setTimeout(() => {
      fetchPredictions(newValue);
    }, 300); // 300ms debounce
  };

  // Get place details when prediction is selected
  const handleSelectPrediction = async (prediction: Prediction) => {
    setInputValue(prediction.description);
    setIsOpen(false);
    setPredictions([]);

    // Get detailed place information
    if (placesServiceRef.current) {
      placesServiceRef.current.getDetails(
        {
          placeId: prediction.place_id,
          fields: ['formatted_address', 'geometry', 'address_components', 'place_id'],
        },
        (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place) {
            onChange(prediction.description, place);
            
            // Generate new session token after successful selection
            sessionTokenRef.current = generateSessionToken();
          } else {
            // Fallback if details fetch fails
            onChange(prediction.description);
          }
        }
      );
    } else {
      onChange(prediction.description);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || predictions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < predictions.length - 1 ? prev + 1 : prev
        );
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

  // Clear input
  const handleClear = () => {
    setInputValue('');
    setPredictions([]);
    setIsOpen(false);
    onChange('');
  };

  return (
    <div ref={wrapperRef} className="relative">
      {/* Input Field */}
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
            if (predictions.length > 0) {
              setIsOpen(true);
            }
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

      {/* Custom Dropdown - Uber Style */}
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

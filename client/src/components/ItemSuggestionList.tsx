import { useState } from "react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import type { DetectedItem } from "@shared/ai";

interface ItemSuggestionListProps {
  item: DetectedItem;
  isExpanded: boolean;
  onToggleExpand: (itemId: string) => void;
  onSelectSuggestion: (itemId: string, suggestion: NonNullable<DetectedItem["alternativeSuggestions"]>[0]) => void;
  onConfirmOriginal: (itemId: string) => void;
}

export function ItemSuggestionList({ 
  item, 
  isExpanded, 
  onToggleExpand,
  onSelectSuggestion, 
  onConfirmOriginal 
}: ItemSuggestionListProps) {
  if (!item.isUncertain || !item.alternativeSuggestions || item.alternativeSuggestions.length === 0) {
    return null;
  }

  return (
    <Alert className="mt-2 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500" data-testid="icon-uncertain-item" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <AlertTitle className="text-amber-900 dark:text-amber-100 mb-0">
              Low Confidence Detection ({item.confidence}%)
            </AlertTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onToggleExpand(item.id)}
              className="h-7 px-2 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
              data-testid="button-toggle-suggestions"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4 mr-1" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 mr-1" />
                  Review
                </>
              )}
            </Button>
          </div>
          
          {isExpanded && (
            <>
              <AlertDescription className="text-amber-800 dark:text-amber-200 mb-3">
                We detected "<span className="font-medium">{item.name}</span>", but we're not completely sure. 
                Please select the correct item or confirm our detection:
              </AlertDescription>

              <div className="space-y-2">
                {item.alternativeSuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => onSelectSuggestion(item.id, suggestion)}
                    className="w-full text-left p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover-elevate active-elevate-2 transition-all"
                    data-testid={`button-select-suggestion-${index}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {suggestion.name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-4 flex-wrap">
                          <span>Size: {suggestion.size}</span>
                          <span>•</span>
                          <span>Weight: {suggestion.weightLbs} lbs</span>
                          <span>•</span>
                          <span>Volume: {suggestion.cubicFeet} cu ft</span>
                          <span>•</span>
                          <span>{suggestion.moversNeeded} mover{suggestion.moversNeeded > 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    </div>
                  </button>
                ))}

                <button
                  onClick={() => onConfirmOriginal(item.id)}
                  className="w-full text-left p-3 rounded-md border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover-elevate active-elevate-2 transition-all"
                  data-testid="button-confirm-original"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-500 flex-shrink-0" />
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        Confirm: {item.name}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Our original detection was correct
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Alert>
  );
}

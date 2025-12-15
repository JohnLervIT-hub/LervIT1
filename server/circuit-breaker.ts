/**
 * Circuit Breaker Pattern for External API Calls
 * 
 * Prevents cascade failures when external services (Stripe, OpenAI, Telnyx)
 * are slow or unavailable. Instead of waiting indefinitely, the circuit
 * "opens" after failures and fails fast.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests fail immediately
 * - HALF_OPEN: Testing if service recovered
 */

import { logEvent } from "./logger";

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;  // Failures before opening (default: 5)
  resetTimeout?: number;      // ms before trying again (default: 30000)
  timeout?: number;           // Request timeout in ms (default: 10000)
}

interface CircuitStats {
  failures: number;
  successes: number;
  lastFailure: Date | null;
  state: CircuitState;
}

class CircuitBreaker {
  private name: string;
  private failureThreshold: number;
  private resetTimeout: number;
  private timeout: number;
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number = 0;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000;
    this.timeout = options.timeout || 10000;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      // Check if reset timeout has passed
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = "HALF_OPEN";
        logEvent.vision("circuit_half_open", { name: this.name });
      } else {
        throw new CircuitOpenError(`Circuit ${this.name} is OPEN - failing fast`);
      }
    }

    try {
      // Add timeout wrapper
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error(`${this.name} timeout after ${this.timeout}ms`)), this.timeout)
        )
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.successes++;
    
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
      logEvent.vision("circuit_closed", { 
        name: this.name, 
        message: "Service recovered" 
      });
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    logEvent.vision("circuit_failure", { 
      name: this.name, 
      failures: this.failures,
      threshold: this.failureThreshold 
    });

    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      logEvent.vision("circuit_open", { 
        name: this.name, 
        message: `Circuit opened after ${this.failures} failures` 
      });
    }
  }

  /**
   * Get current circuit stats
   */
  getStats(): CircuitStats {
    return {
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime) : null,
      state: this.state,
    };
  }

  /**
   * Force reset the circuit (for testing/admin)
   */
  reset(): void {
    this.state = "CLOSED";
    this.failures = 0;
    this.lastFailureTime = 0;
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

// Pre-configured circuit breakers for each external service
export const circuitBreakers = {
  openai: new CircuitBreaker({ 
    name: "OpenAI", 
    failureThreshold: 3, 
    resetTimeout: 60000,  // 1 minute
    timeout: 30000        // 30 seconds (Vision API can be slow)
  }),
  
  stripe: new CircuitBreaker({ 
    name: "Stripe", 
    failureThreshold: 5, 
    resetTimeout: 30000,
    timeout: 15000
  }),
  
  telnyx: new CircuitBreaker({ 
    name: "Telnyx", 
    failureThreshold: 5, 
    resetTimeout: 30000,
    timeout: 10000
  }),
  
  googleMaps: new CircuitBreaker({ 
    name: "GoogleMaps", 
    failureThreshold: 5, 
    resetTimeout: 30000,
    timeout: 10000
  }),
};

/**
 * Helper to wrap any async function with circuit breaker protection
 */
export function withCircuitBreaker<T>(
  breaker: CircuitBreaker,
  fn: () => Promise<T>
): Promise<T> {
  return breaker.execute(fn);
}

/**
 * Get status of all circuit breakers
 */
export function getAllCircuitStatus(): Record<string, CircuitStats> {
  return {
    openai: circuitBreakers.openai.getStats(),
    stripe: circuitBreakers.stripe.getStats(),
    telnyx: circuitBreakers.telnyx.getStats(),
    googleMaps: circuitBreakers.googleMaps.getStats(),
  };
}

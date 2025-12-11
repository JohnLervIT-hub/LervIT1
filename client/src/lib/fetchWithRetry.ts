// LervIT final hardening: API retry utility for transient failures
// Only retries on network errors and 5xx responses
// NEVER retries 4xx errors or mutation operations

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 2,
  baseDelayMs: 300,
  maxDelayMs: 2000,
};

/**
 * Determines if an error is transient and should be retried
 */
function isTransientError(error: unknown): boolean {
  // Network errors (fetch failed, connection reset, etc.)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  
  // Check for common network error messages
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('failed to fetch') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('timeout')
    ) {
      return true;
    }
  }
  
  return false;
}

/**
 * Determines if an HTTP status code is retryable
 */
function isRetryableStatus(status: number): boolean {
  // Only retry 5xx server errors
  return status >= 500 && status < 600;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelayMs * Math.pow(2, attempt);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Fetch with automatic retry for transient failures
 * 
 * SAFE FOR:
 * - GET requests (read-only)
 * - Idempotent operations with idempotency keys
 * 
 * NOT SAFE FOR:
 * - POST/PUT/DELETE without idempotency keys
 * - Payment operations (use Stripe's built-in retry)
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  config: Partial<RetryConfig> = {}
): Promise<Response> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const method = (options.method || 'GET').toUpperCase();
  
  // Only auto-retry GET/HEAD requests by default
  // Other methods need explicit opt-in via config
  const isSafeMethod = method === 'GET' || method === 'HEAD';
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Check if we should retry based on status
      if (isRetryableStatus(response.status) && isSafeMethod && attempt < finalConfig.maxRetries) {
        const delay = calculateDelay(attempt, finalConfig);
        console.warn(`[fetchWithRetry] Server error ${response.status} on ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${finalConfig.maxRetries})`);
        await sleep(delay);
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      
      // Only retry transient errors for safe methods
      if (isTransientError(error) && isSafeMethod && attempt < finalConfig.maxRetries) {
        const delay = calculateDelay(attempt, finalConfig);
        console.warn(`[fetchWithRetry] Transient error on ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${finalConfig.maxRetries}):`, error);
        await sleep(delay);
        continue;
      }
      
      // Non-retryable error or max retries reached
      throw error;
    }
  }
  
  // Should not reach here, but just in case
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Check if a request should use retry logic
 * Use this to wrap specific queries that need retry behavior
 */
export function shouldRetry(method: string): boolean {
  const safeMethod = method.toUpperCase();
  return safeMethod === 'GET' || safeMethod === 'HEAD';
}

# Load Testing

Uses [k6](https://k6.io) to simulate realistic booking flow traffic.

## Setup

Install k6:
- macOS: `brew install k6`
- Linux: see https://k6.io/docs/get-started/installation/

## Running

```bash
# Default (hits localhost:5000)
npm run load-test

# Against staging
BASE_URL=https://your-staging-url.com npm run load-test

# Quick smoke run (5 VUs, 30s)
k6 run --vus 5 --duration 30s tests/load/k6-booking-flow.js
```

## Test Stages

| Stage    | VUs | Duration |
|----------|-----|----------|
| Ramp up  | 50  | 2m       |
| Load     | 200 | 5m       |
| Stress   | 500 | 5m       |
| Ramp down| 0   | 2m       |

## Thresholds

- `p(95)` response time < 2000ms
- Error rate < 5%
- Failed request rate < 5%

## What it tests

1. `GET /api/health` — health check (no auth)
2. `GET /api/movers?isAvailable=true` — mover listing (no auth)
3. `POST /api/price-estimate` — price estimate (no auth)
4. `GET /api/places/autocomplete` — address autocomplete proxy

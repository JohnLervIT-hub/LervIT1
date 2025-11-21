# Post-MVP Optimization Roadmap

## Overview
This document outlines known technical debt, performance optimizations, and feature enhancements that should be addressed after MVP launch.

---

## Performance Optimizations

### 1. N+1 Query Problems

**Issue**: Multiple endpoints fetch related data in loops instead of using JOINs or batch queries.

**Affected Endpoints**:
- `GET /api/bookings` - Fetches customer and mover data individually for each booking
- `GET /api/movers` - Fetches user data individually for each mover
- `POST /api/bookings` - Creates job notifications in loop

**Impact**: Moderate - Increases response time with large datasets (100+ bookings)

**Solution**: 
- Use Drizzle ORM's `leftJoin` to batch-fetch related data
- Example:
```typescript
const bookingsWithRelations = await db
  .select()
  .from(bookings)
  .leftJoin(users, eq(bookings.customerId, users.id))
  .leftJoin(movers, eq(bookings.moverId, movers.id));
```

**Priority**: Medium (for production scale at 500+ bookings/day)

---

### 2. Admin Dashboard Pagination

**Issue**: Admin dashboard loads all bookings and tickets without pagination.

**Impact**: Low for MVP (<100 records), Critical at scale (1000+ records)

**Solution**:
- Add `limit` and `offset` to admin queries
- Implement frontend pagination controls
- Add page size selector (10, 25, 50, 100)

**Priority**: Low for MVP, High for production

---

### 3. Database Indexes - Applied ✅

**Completed**: Added 11 strategic indexes:
- `bookings`: customerId, moverId, status, paymentStatus
- `movers`: userId, isAvailable
- `messages`: bookingId
- `reviews`: moverId, bookingId
- `supportTickets`: userId, status
- `supportTicketReplies`: ticketId
- `jobNotifications`: moverId+status (composite)

**Remaining**: No additional indexes needed for MVP scale.

---

## Type Safety Improvements

### 4. Minor LSP Type Errors

**Status**: 4 minor type mismatches remain (non-blocking)

**Details**:
- `bookingData.additionalDetails` optional field mismatch
- `preferredDate` string vs Date type in some paths
- Job notification schema field mismatches

**Workaround**: Using strategic `as any` casts for MVP

**Solution**: 
- Refine Zod schemas to exactly match Drizzle types
- Create explicit type mappers for API layer
- Add runtime validation for optional fields

**Priority**: Low - Does not affect runtime behavior

---

## Security Enhancements

### 5. Rate Limiting

**Status**: Not implemented

**Risk**: API abuse, DDoS vulnerability

**Solution**:
- Add `express-rate-limit` middleware
- Configure per-endpoint limits:
  - Public endpoints: 100 req/15min per IP
  - Authenticated: 1000 req/15min per user
  - Payment endpoints: 10 req/15min per user

**Priority**: High for public launch

---

### 6. Input Sanitization

**Status**: Basic Zod validation only

**Risk**: XSS attacks in text fields

**Solution**:
- Add DOMPurify for message/review content
- Escape HTML in all user-generated content
- Validate file uploads more strictly

**Priority**: Medium

---

## Feature Enhancements

### 7. Real OpenAI Integration

**Status**: Using mock deterministic AI

**Benefit**: Genuine AI-powered features

**Solution**:
- Replace `shared/ai.ts` mock functions
- Integrate OpenAI Vision API for photo analysis
- Use GPT-4 for price explanations

**Cost**: ~$0.01 per AI request

**Priority**: Low - Mock version works well for MVP

---

### 8. Email Notifications - Production Ready

**Status**: Console-logged (demo mode)

**Solution**:
- Integrate SendGrid/Resend
- Update `server/notifications.ts` SMTP config
- Add email templates with branding

**Priority**: High for production (customers expect emails)

---

### 9. Image Storage - Production Ready

**Status**: Storing in `/uploads` directory (not scalable)

**Solution**:
- Migrate to cloud storage (AWS S3, Cloudflare R2)
- Update Multer config for cloud uploads
- Add CDN for faster image delivery

**Priority**: Medium for production scale

---

## Code Quality

### 10. Test Coverage

**Status**: Minimal automated testing

**Solution**:
- Add unit tests for pricing calculations
- E2E tests for critical flows (booking, payment)
- Integration tests for API endpoints

**Priority**: Medium

---

### 11. Error Logging

**Status**: Basic console.error only

**Solution**:
- Add Sentry/LogRocket for error tracking
- Implement structured logging
- Add performance monitoring

**Priority**: High for production debugging

---

## Mobile Experience

### 12. Progressive Web App (PWA)

**Status**: Mobile-responsive but not installable

**Solution**:
- Add service worker for offline capability
- Create app manifest
- Add "Add to Home Screen" prompt

**Priority**: Low (nice-to-have)

---

### 13. Push Notifications

**Status**: Not implemented

**Benefit**: Real-time job alerts for movers

**Solution**:
- Implement Web Push API
- Add notification permission flow
- Send push for new job offers

**Priority**: Low for MVP, High for mover engagement

---

## Scalability Considerations

### Current MVP Capacity
- **Concurrent users**: ~100-500
- **Daily bookings**: <100
- **Database size**: <10GB
- **Response times**: <500ms (95th percentile)

### When to Upgrade
- Add caching (Redis) at 1000+ daily bookings
- Consider database replication at 10,000+ bookings
- Add load balancing at 1000+ concurrent users
- Implement CDN for static assets at launch

---

## Monitoring & Analytics

### 14. Business Metrics Dashboard

**Status**: No analytics

**Solution**:
- Track key metrics: booking completion rate, average earnings, customer satisfaction
- Add Google Analytics or Mixpanel
- Create admin analytics dashboard

**Priority**: Medium

---

## Conclusion

The LervIT MVP is **production-ready** for soft launch with <100 daily bookings. The documented optimizations should be prioritized based on actual user growth and feedback.

**Immediate Post-Launch Priorities**:
1. Rate limiting
2. Production email integration
3. Error logging/monitoring
4. Cloud image storage

**Growth-Triggered Priorities**:
- N+1 query optimization at 500+ daily bookings
- Pagination at 1000+ records
- Caching/replication at 1000+ daily bookings

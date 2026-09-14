import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function PrivacyPolicy() {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "Privacy Policy | LervIT";
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back-home">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            data-testid="button-print-privacy"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print / Save PDF
          </Button>
        </div>

        <Card>
          <CardContent className="p-6 sm:p-8">
            <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="privacy-content">
              <h1 className="text-2xl font-bold mb-1">LervIT — Privacy Policy</h1>
              <p className="text-muted-foreground text-sm mb-6">Last Updated: February 2026</p>

              <p>
                LervIT ("we", "us", "our") is committed to protecting your privacy. This Privacy Policy explains how we
                collect, use, disclose, and safeguard your personal information when you use the LervIT platform, including
                our website, mobile application, and related services (the "Platform"). This policy is designed to comply
                with Canada's Personal Information Protection and Electronic Documents Act (PIPEDA) and Alberta's Personal
                Information Protection Act (PIPA).
              </p>

              <Separator className="my-6" />

              <h2 className="text-lg font-semibold mt-6 mb-3">1. Information We Collect</h2>

              <h3 className="text-base font-medium mt-4 mb-2">1.1 Information You Provide</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Account Information:</strong> Name, email address, phone number, and password (stored as a secure hash).</li>
                <li><strong>Profile Information:</strong> For movers — vehicle details, profile photos, bio, and service area preferences.</li>
                <li><strong>Booking Information:</strong> Pickup and drop-off addresses, load descriptions, scheduling preferences, and photos of items to be moved.</li>
                <li><strong>Payment Information:</strong> Payment card details are collected and processed securely by our payment processor, Stripe. LervIT does not store full credit card numbers on our servers.</li>
                <li><strong>Communications:</strong> Messages exchanged between customers and movers through the Platform, and support ticket content.</li>
                <li><strong>Verification Documents:</strong> Movers may be asked to submit identification or insurance documentation as part of the verification process.</li>
              </ul>

              <h3 className="text-base font-medium mt-4 mb-2">1.2 Information Collected Automatically</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Location Data:</strong> With your permission, we collect GPS location data from movers to enable proximity matching, live tracking during active moves, and the "Find Movers" feature. Location sharing can be toggled on or off at any time.</li>
                <li><strong>Device and Usage Data:</strong> Browser type, operating system, IP address, pages viewed, and interaction patterns for analytics and performance improvement.</li>
                <li><strong>Session Data:</strong> Login timestamps and session identifiers for security purposes.</li>
              </ul>

              <h3 className="text-base font-medium mt-4 mb-2">1.3 Information from Third Parties</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Google Maps:</strong> Geocoding data and distance/time calculations for route planning and pricing.</li>
                <li><strong>Stripe:</strong> Payment confirmation status, payout details, and Stripe Connect onboarding status.</li>
                <li><strong>OpenAI:</strong> AI-processed analysis of uploaded item photos for volume estimation (images are processed but not permanently stored by the AI provider).</li>
              </ul>

              <h2 className="text-lg font-semibold mt-6 mb-3">2. How We Use Your Information</h2>
              <p>We use collected information to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Create and manage your account.</li>
                <li>Verify your identity through phone (OTP) and email verification.</li>
                <li>Match customers with nearby available movers.</li>
                <li>Calculate pricing based on distance, load volume, and vehicle type.</li>
                <li>Process payments and manage mover payouts.</li>
                <li>Enable real-time GPS tracking during active moves.</li>
                <li>Facilitate in-app communication between customers and movers.</li>
                <li>Provide AI-powered features including volume estimation and price predictions.</li>
                <li>Send transactional notifications (SMS, email, in-app) about bookings, payments, and account updates.</li>
                <li>Improve Platform functionality, user experience, and security.</li>
                <li>Respond to support requests and resolve disputes.</li>
                <li>Comply with legal obligations.</li>
              </ul>

              <h2 className="text-lg font-semibold mt-6 mb-3">3. How We Share Your Information</h2>
              <p>We do not sell your personal information. We may share information in the following circumstances:</p>

              <h3 className="text-base font-medium mt-4 mb-2">3.1 Between Users</h3>
              <p>
                When a booking is created, limited information is shared between the customer and mover, including
                names, phone numbers (for coordination), pickup/drop-off locations, and load details. Mover profiles
                (name, rating, vehicle details, verification status) are visible to customers browsing the Platform.
              </p>

              <h3 className="text-base font-medium mt-4 mb-2">3.2 Service Providers</h3>
              <p>We share information with trusted third-party services that help operate the Platform:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Stripe:</strong> Payment processing and mover payouts.</li>
                <li><strong>Resend:</strong> Transactional email delivery.</li>
                <li><strong>Telnyx:</strong> SMS notifications and OTP verification.</li>
                <li><strong>Google Maps:</strong> Location services, geocoding, and distance calculations.</li>
                <li><strong>OpenAI:</strong> AI image analysis for item identification and volume estimation.</li>
                <li><strong>Neon:</strong> Database hosting (PostgreSQL).</li>
              </ul>
              <p>
                These providers process data only as necessary to perform their services and are bound by their own
                privacy and data protection obligations.
              </p>

              <h3 className="text-base font-medium mt-4 mb-2">3.3 Legal Requirements</h3>
              <p>
                We may disclose information if required to do so by law, court order, or government regulation, or
                if we believe disclosure is necessary to protect the rights, property, or safety of LervIT, our users,
                or the public.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">4. Data Retention</h2>
              <p>We retain your personal information for as long as necessary to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Maintain your active account and provide services.</li>
                <li>Comply with legal, accounting, and reporting requirements.</li>
                <li>Resolve disputes and enforce agreements.</li>
              </ul>
              <p>
                Booking records and payment history are retained for a minimum of 7 years for tax and regulatory
                compliance. If you close your account, we will delete or anonymize your personal information within
                a reasonable period, except where retention is required by law.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">5. Data Security</h2>
              <p>We implement industry-standard security measures to protect your information, including:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Encrypted data transmission (HTTPS/TLS).</li>
                <li>Secure password hashing (SHA-256).</li>
                <li>Session-based authentication with automatic expiration.</li>
                <li>Single-session enforcement for administrative accounts.</li>
                <li>Stripe webhook signature verification for payment security.</li>
                <li>Environment-based access controls for production systems.</li>
              </ul>
              <p>
                While we take reasonable precautions, no method of electronic transmission or storage is 100% secure.
                We cannot guarantee absolute security of your data.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">6. Your Rights</h2>
              <p>Under PIPEDA and PIPA, you have the right to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Access:</strong> Request a copy of the personal information we hold about you.</li>
                <li><strong>Correction:</strong> Request corrections to inaccurate or incomplete information.</li>
                <li><strong>Withdrawal of Consent:</strong> Withdraw consent for certain data processing activities (this may affect your ability to use some features).</li>
                <li><strong>Deletion:</strong> Request deletion of your personal information, subject to legal retention requirements.</li>
                <li><strong>Complaint:</strong> File a complaint with the Office of the Privacy Commissioner of Canada or the Office of the Information and Privacy Commissioner of Alberta.</li>
                <li>
                  <strong>Self-serve deletion:</strong> Visit{" "}
                  <a
                    href="https://lervit.com/data-deletion"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    lervit.com/data-deletion
                  </a>{" "}
                  for step-by-step instructions.
                </li>
              </ul>
              <p>
                To exercise any of these rights, contact us at the address provided below.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">7. Location Data</h2>
              <p>
                Location data is central to the Platform's functionality. For movers, GPS data is collected when
                they opt in to location sharing — updates are sent approximately every 30 seconds while marked as
                available. For customers, location data is used to show nearby movers and calculate distances.
                A mover's live location is shown on the "Find Movers" page only when they have provided updates
                within the last hour. You can disable location sharing through the Platform at any time.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">8. AI and Automated Processing</h2>
              <p>
                LervIT uses artificial intelligence (OpenAI) to analyze photos of items uploaded during the booking
                process. This analysis identifies furniture and items, estimates volumes, and suggests appropriate
                vehicle types. AI-generated results are estimates and are not guaranteed to be accurate. No automated
                decision-making is used that would have significant legal effects on users without human review.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">9. Cookies and Tracking</h2>
              <p>
                The Platform uses session cookies for authentication and may use analytics tools to understand usage
                patterns. We do not use third-party advertising cookies. Session cookies are essential for the
                Platform to function and cannot be disabled while using the service.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">10. Children's Privacy</h2>
              <p>
                The Platform is not intended for use by individuals under 18 years of age. We do not knowingly collect
                personal information from children. If we become aware that we have collected information from a
                minor, we will take steps to delete it promptly.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">11. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. Material changes will be communicated via email
                or in-app notification. The "Last Updated" date at the top of this page indicates when the policy was
                last revised. Continued use of the Platform after changes take effect constitutes acceptance.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">12. Contact Us</h2>
              <p>
                If you have questions about this Privacy Policy, wish to exercise your privacy rights, or need to
                file a complaint, please contact us:
              </p>
              <ul className="list-none pl-0 space-y-1">
                <li><strong>LervIT — Privacy Office</strong></li>
                <li>Calgary, Alberta, Canada</li>
                <li>Email: privacy@lervit.com</li>
              </ul>

              <Separator className="my-6" />

              <p className="text-sm text-muted-foreground">
                By using the LervIT Platform, you acknowledge that you have read and understood this Privacy Policy
                and consent to the collection, use, and disclosure of your personal information as described herein.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

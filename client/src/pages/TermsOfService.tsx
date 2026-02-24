import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function TermsOfService() {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "Terms of Service | LervIT";
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
            data-testid="button-print-terms"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print / Save PDF
          </Button>
        </div>

        <Card>
          <CardContent className="p-6 sm:p-8">
            <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="terms-content">
              <h1 className="text-2xl font-bold mb-1">LervIT — Platform Terms of Service</h1>
              <p className="text-muted-foreground text-sm mb-6">Last Updated: February 2026</p>

              <p>
                Welcome to LervIT. These Terms of Service ("Terms") govern your access to and use of the LervIT platform,
                including our website, mobile application, and all related services (collectively, the "Platform").
                By creating an account or using the Platform, you agree to be bound by these Terms.
                If you do not agree, please do not use the Platform.
              </p>

              <Separator className="my-6" />

              <h2 className="text-lg font-semibold mt-6 mb-3">1. About LervIT</h2>
              <p>
                LervIT is a technology platform that connects customers who need moving services ("Customers") with
                independent moving professionals ("Movers") in Calgary, Alberta, and surrounding areas. LervIT does not
                itself provide moving services. LervIT acts as an intermediary marketplace, facilitating connections,
                communications, bookings, and payments between Customers and Movers.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">2. Eligibility</h2>
              <p>To use the Platform, you must:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Be at least 18 years of age.</li>
                <li>Have the legal capacity to enter into a binding agreement.</li>
                <li>Provide accurate, current, and complete registration information.</li>
                <li>Comply with all applicable federal, provincial, and municipal laws.</li>
              </ul>

              <h2 className="text-lg font-semibold mt-6 mb-3">3. Account Registration</h2>
              <p>
                You must create an account to access the Platform's core features. During registration, you will be
                required to verify your phone number via one-time password (OTP) and verify your email address.
                You are responsible for maintaining the confidentiality of your account credentials. You agree to
                notify LervIT immediately of any unauthorized use of your account.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">4. Platform Services</h2>
              <h3 className="text-base font-medium mt-4 mb-2">4.1 For Customers</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Browse and select available movers based on proximity, pricing, vehicle type, and ratings.</li>
                <li>Submit booking requests with pickup/drop-off locations, load details, and scheduling preferences.</li>
                <li>Upload photos of items to be moved for AI-powered volume estimation and pricing.</li>
                <li>Communicate with movers through the in-app messaging system.</li>
                <li>Track moves in real time via GPS.</li>
                <li>Make secure payments through the Platform using Stripe.</li>
                <li>Leave reviews and ratings for completed moves.</li>
              </ul>

              <h3 className="text-base font-medium mt-4 mb-2">4.2 For Movers</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Create a professional profile with vehicle details, photos, and service area.</li>
                <li>Receive job notifications based on proximity matching.</li>
                <li>Accept or decline job offers at your sole discretion.</li>
                <li>Communicate with customers through the in-app messaging system.</li>
                <li>Receive payments through Stripe Connect with automatic payout processing.</li>
                <li>Manage availability and earnings through a dedicated dashboard.</li>
              </ul>

              <h2 className="text-lg font-semibold mt-6 mb-3">5. Payments and Fees</h2>
              <h3 className="text-base font-medium mt-4 mb-2">5.1 Pricing</h3>
              <p>
                Move pricing is determined by factors including distance, load volume, vehicle type, and scheduling.
                Prices displayed at the time of booking are estimates and may vary based on actual conditions.
                All prices are quoted in Canadian Dollars (CAD).
              </p>

              <h3 className="text-base font-medium mt-4 mb-2">5.2 Platform Fee</h3>
              <p>
                LervIT charges a platform service fee on each completed booking. The current fee structure is:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Movers receive 85% of the booking price.</li>
                <li>LervIT retains 15% as a platform fee.</li>
              </ul>
              <p>
                LervIT reserves the right to modify fee structures with reasonable notice to users.
              </p>

              <h3 className="text-base font-medium mt-4 mb-2">5.3 Payment Processing</h3>
              <p>
                All payments are processed securely through Stripe. Customers may save payment methods for future
                bookings. Mover payouts are processed through Stripe Connect and are subject to Stripe's own terms
                and processing timelines.
              </p>

              <h3 className="text-base font-medium mt-4 mb-2">5.4 Promotional Codes</h3>
              <p>
                LervIT may offer promotional codes from time to time. Promo codes are subject to specific terms,
                including usage limits, expiration dates, and eligible users. Promotional discounts are absorbed
                by the Platform — movers receive their full share regardless of any customer discount applied.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">6. User Conduct</h2>
              <p>You agree not to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Use the Platform for any unlawful purpose.</li>
                <li>Provide false, misleading, or inaccurate information.</li>
                <li>Harass, threaten, or abuse other users.</li>
                <li>Attempt to circumvent Platform fees by arranging payments outside the Platform.</li>
                <li>Use the Platform to solicit services outside of LervIT after an initial connection.</li>
                <li>Interfere with or disrupt the Platform's operation or security.</li>
                <li>Create multiple accounts or impersonate another person.</li>
                <li>Use automated means (bots, scrapers) to access the Platform.</li>
              </ul>

              <h2 className="text-lg font-semibold mt-6 mb-3">7. Independent Contractor Status (Movers)</h2>
              <p>
                Movers using the Platform are independent contractors, not employees, agents, or partners of LervIT.
                LervIT does not control the manner or method by which movers perform services. Movers are solely
                responsible for their own taxes (including GST/HST), insurance, vehicles, equipment, and compliance
                with applicable laws. Separate mover-specific terms apply and must be accepted during onboarding.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">8. Liability and Disclaimers</h2>
              <h3 className="text-base font-medium mt-4 mb-2">8.1 Platform Role</h3>
              <p>
                LervIT is a technology marketplace. We do not provide moving services and are not responsible for the
                quality, safety, legality, or timeliness of services provided by Movers. LervIT does not guarantee
                the accuracy of AI-generated estimates, including volume calculations and price predictions.
              </p>

              <h3 className="text-base font-medium mt-4 mb-2">8.2 Limitation of Liability</h3>
              <p>
                To the maximum extent permitted by applicable law, LervIT shall not be liable for any indirect,
                incidental, special, consequential, or punitive damages, including but not limited to loss of
                profits, data, or property damage arising from your use of the Platform.
              </p>

              <h3 className="text-base font-medium mt-4 mb-2">8.3 Indemnification</h3>
              <p>
                You agree to indemnify and hold harmless LervIT, its officers, directors, employees, and agents
                from any claims, damages, losses, or expenses arising from your use of the Platform, your violation
                of these Terms, or your violation of any third party's rights.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">9. Dispute Resolution</h2>
              <p>
                If a dispute arises between a Customer and a Mover, LervIT encourages users to first attempt
                resolution through the in-app support system. LervIT may, at its discretion, mediate disputes
                but is not obligated to do so. For disputes between you and LervIT, the laws of the Province of
                Alberta and the federal laws of Canada applicable therein shall govern. Any legal proceedings
                shall be brought in the courts of Calgary, Alberta.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">10. Safety and Reporting</h2>
              <p>
                LervIT takes safety seriously. Customers may report movers through the Platform, which generates
                high-priority support tickets reviewed by our team. LervIT reserves the right to suspend or
                permanently remove any user who poses safety concerns, engages in fraudulent activity, or
                repeatedly violates these Terms.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">11. Intellectual Property</h2>
              <p>
                The Platform, including its design, logos, text, graphics, software, and all related intellectual
                property, is owned by LervIT or its licensors. You may not copy, modify, distribute, or create
                derivative works based on the Platform without prior written consent from LervIT.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">12. Modifications to Terms</h2>
              <p>
                LervIT reserves the right to update or modify these Terms at any time. Material changes will be
                communicated via email or in-app notification. Continued use of the Platform after changes take
                effect constitutes acceptance of the revised Terms.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">13. Termination</h2>
              <p>
                You may close your account at any time by contacting support. LervIT may suspend or terminate
                your account at any time, with or without notice, for violation of these Terms or for any other
                reason at its sole discretion. Upon termination, your right to use the Platform ceases immediately.
                Outstanding payment obligations survive termination.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">14. Contact Information</h2>
              <p>For questions about these Terms, please contact us:</p>
              <ul className="list-none pl-0 space-y-1">
                <li><strong>LervIT</strong></li>
                <li>Calgary, Alberta, Canada</li>
                <li>Email: support@lervit.com</li>
              </ul>

              <Separator className="my-6" />

              <p className="text-sm text-muted-foreground">
                By using the LervIT Platform, you acknowledge that you have read, understood, and agree to be
                bound by these Terms of Service.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

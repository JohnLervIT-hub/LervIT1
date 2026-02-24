import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function MoverAgreement() {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "Early Access Mover Agreement | LervIT";
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
            data-testid="button-print-agreement"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print / Save PDF
          </Button>
        </div>

        <Card>
          <CardContent className="p-6 sm:p-8">
            <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="agreement-content">
              <h1 className="text-2xl font-bold mb-1">LervIT — Early Access Mover Terms (Pilot)</h1>
              <p className="text-muted-foreground text-sm mb-6">Effective Date: Upon Acceptance | Program: Early Access (Pilot)</p>

              <p>
                By clicking "I Agree" during the mover onboarding process, you ("Mover") agree to the following terms
                to participate in LervIT's Early Access pilot program.
              </p>

              <Separator className="my-6" />

              <h2 className="text-lg font-semibold mt-6 mb-3">1. Early Access Status</h2>
              <p>
                You are approved to participate in LervIT's Early Access (Pilot). Early Access does not mean
                "verified". Full verification requirements may be introduced later as the platform scales.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">2. Independent Contractor Relationship</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>You are an independent contractor, not an employee, partner, or agent of LervIT.</li>
                <li>You choose when, where, and whether to accept jobs.</li>
                <li>You may work for other platforms or clients at any time.</li>
                <li>LervIT does not provide wages, benefits, insurance, or equipment.</li>
              </ul>

              <h2 className="text-lg font-semibold mt-6 mb-3">3. Vehicle, Insurance, and Responsibility</h2>
              <p>You confirm that:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>You own or have lawful access to the vehicle you use.</li>
                <li>You are responsible for maintaining valid auto insurance and any coverage required for your operations.</li>
                <li>You are responsible for safe loading, transport, and delivery of items.</li>
                <li>LervIT does not provide cargo, vehicle, or liability insurance for movers during the Early Access pilot.</li>
              </ul>

              <h2 className="text-lg font-semibold mt-6 mb-3">4. Payments and Fees</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>You will be paid for completed jobs according to the app's pricing and payout rules.</li>
                <li>LervIT may apply a platform service fee. During Early Access, this fee may be reduced or refunded at LervIT's discretion.</li>
                <li>The current payout structure is 85% of the booking price to the mover, with 15% retained by the platform.</li>
                <li>Payouts are processed through Stripe Connect and are subject to Stripe's processing timelines.</li>
                <li>You are responsible for your own taxes, including GST/HST if applicable.</li>
              </ul>

              <h2 className="text-lg font-semibold mt-6 mb-3">5. Job Acceptance and Conduct</h2>
              <p>You may freely accept or decline any job. If you accept a job, you agree to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Contact the customer promptly.</li>
                <li>Arrive on time.</li>
                <li>Perform the job professionally and safely.</li>
              </ul>
              <p>
                Unsafe behavior, fraud, or misuse of the platform may result in suspension or removal.
              </p>

              <h2 className="text-lg font-semibold mt-6 mb-3">6. Communications</h2>
              <p>You agree to receive transactional communications (SMS, calls, in-app notifications) related to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Job offers</li>
                <li>Job updates</li>
                <li>Payouts</li>
                <li>Account status</li>
              </ul>
              <p>You may opt out of non-essential messages where applicable.</p>

              <h2 className="text-lg font-semibold mt-6 mb-3">7. Suspension or Removal</h2>
              <p>
                LervIT may suspend or remove your Early Access status at any time, with or without notice, including for:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Safety concerns</li>
                <li>Repeated no-shows</li>
                <li>Customer complaints</li>
                <li>Misrepresentation of vehicle or services</li>
              </ul>

              <h2 className="text-lg font-semibold mt-6 mb-3">8. Limitation of Liability</h2>
              <p>To the maximum extent permitted by law:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>LervIT is not responsible for loss, damage, or disputes arising from jobs accepted through the platform.</li>
                <li>You agree to indemnify LervIT against claims arising from your actions as a mover.</li>
              </ul>

              <h2 className="text-lg font-semibold mt-6 mb-3">9. Future Verification</h2>
              <p>You acknowledge that:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Additional verification (ID, insurance, background checks) may be required later.</li>
                <li>Continued access to the platform may depend on completing those steps.</li>
              </ul>

              <h2 className="text-lg font-semibold mt-6 mb-3">10. Acceptance</h2>
              <p>By clicking "I Agree" during onboarding, you confirm that:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>You have read and understood these terms.</li>
                <li>You agree to participate as an independent contractor in the Early Access pilot.</li>
              </ul>

              <Separator className="my-6" />

              <h2 className="text-lg font-semibold mt-6 mb-3">Contact</h2>
              <p>For questions about this agreement:</p>
              <ul className="list-none pl-0 space-y-1">
                <li><strong>LervIT</strong></li>
                <li>Calgary, Alberta, Canada</li>
                <li>Email: support@lervit.com</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Car,
  CheckCircle,
  Loader2,
  Package,
  ShieldCheck,
  Truck,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const API_URL = `${import.meta.env.VITE_API_URL || 'https://app.lervit.com'}/api/apply/mover`

const NEIGHBOURHOODS = [
  'NE Calgary',
  'NW Calgary',
  'SE Calgary',
  'SW Calgary',
  'Downtown',
  'Airdrie',
  'Cochrane',
  'Chestermere',
  'Other',
] as const

const VEHICLE_OPTIONS = [
  { id: 'suv', label: 'SUV / Car', desc: 'Small items & boxes', icon: Car },
  { id: 'pickup', label: 'Pickup Truck', desc: 'Furniture & medium loads', icon: Truck },
  { id: 'van', label: 'Cargo Van', desc: 'Full room moves', icon: Package },
  { id: 'truck', label: 'Moving Truck', desc: 'Apartment moves', icon: Truck },
] as const

type VehicleId = typeof VEHICLE_OPTIONS[number]['id']

const AVAILABILITY_SLOTS = [
  'Weekday mornings (8am–12pm)',
  'Weekday afternoons (12pm–6pm)',
  'Weekday evenings (6pm–10pm)',
  'Saturdays',
  'Sundays',
] as const

const JOBS_PER_WEEK = [
  { value: '1-2', label: '1-2 jobs/week' },
  { value: '3-5', label: '3-5 jobs/week' },
  { value: '5-10', label: '5-10 jobs/week' },
  { value: 'max', label: 'As many as possible' },
] as const

const REFERRAL_SOURCES = [
  'Kijiji',
  'Craigslist',
  'Reddit',
  'Facebook',
  'Google',
  'Friend/Referral',
  'Other',
] as const

const YEARS = Array.from({ length: 27 }, (_, i) => String(2026 - i))

const STEP_LABELS = ['About You', 'Your Vehicle', 'Availability'] as const

interface FormState {
  name: string
  phone: string
  email: string
  neighbourhood: string
  vehicleType: VehicleId | ''
  vehicleYear: string
  vehicleMake: string
  canMoveFurniture: boolean
  availability: string[]
  minJobsPerWeek: string
  referralSource: string
}

const BLANK: FormState = {
  name: '',
  phone: '',
  email: '',
  neighbourhood: '',
  vehicleType: '',
  vehicleYear: '',
  vehicleMake: '',
  canMoveFurniture: true,
  availability: [],
  minJobsPerWeek: '',
  referralSource: '',
}

export default function BecomeAMover() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [form, setForm] = useState<FormState>(BLANK)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const step1Valid =
    form.name.trim().length > 1 &&
    form.phone.trim().length >= 10 &&
    form.email.includes('@') &&
    form.email.includes('.')
  const step2Valid = form.vehicleType !== ''
  const step3Valid = form.availability.length > 0 && form.minJobsPerWeek !== ''

  const handleSubmit = async () => {
    if (!step3Valid || isSubmitting) return
    setIsSubmitting(true)
    setError('')
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          email: form.email,
          neighbourhood: form.neighbourhood,
          vehicleType: form.vehicleType,
          vehicleYear: form.vehicleYear,
          vehicleMake: form.vehicleMake,
          canMoveFurniture: form.canMoveFurniture,
          availability: form.availability,
          minJobsPerWeek: form.minJobsPerWeek,
          referralSource: form.referralSource,
        }),
      })
      if (!res.ok) throw new Error('Submission failed')
      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <img src="/favicon.ico" className="w-8 h-8" alt="LervIT" />
            <span className="font-bold text-lg">LervIT</span>
          </a>
          <span className="text-sm text-muted-foreground">Mover Application</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">
        {submitted ? (
          <SuccessScreen />
        ) : (
          <FormSteps
            step={step}
            setStep={setStep}
            form={form}
            setForm={setForm}
            step1Valid={step1Valid}
            step2Valid={step2Valid}
            step3Valid={step3Valid}
            isSubmitting={isSubmitting}
            error={error}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  )
}

interface StepsProps {
  step: 1 | 2 | 3
  setStep: (s: 1 | 2 | 3) => void
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  step1Valid: boolean
  step2Valid: boolean
  step3Valid: boolean
  isSubmitting: boolean
  error: string
  onSubmit: () => void
}

function FormSteps({ step, setStep, form, setForm, step1Valid, step2Valid, step3Valid, isSubmitting, error, onSubmit }: StepsProps) {
  return (
    <>
      <StepIndicator step={step} />

      {step === 1 && <StepAbout form={form} setForm={setForm} />}
      {step === 2 && <StepVehicle form={form} setForm={setForm} />}
      {step === 3 && <StepAvailability form={form} setForm={setForm} />}

      {error && (
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* CASL/CTIA express consent. This form writes leads with
          sourceChannel 'mover_application', which Jordan treats as consented
          for SMS — this is the disclosure that backs that. */}
      {step === 3 && (
        <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground" data-testid="text-sms-consent">
          By submitting this application you agree to receive SMS updates from LervIT at
          the number provided, including messages sent by an automated system. Consent is
          not a condition of being accepted as a mover. Message frequency varies; message
          and data rates may apply. Reply STOP to opt out. See our{' '}
          <a
            href="https://app.lervit.com/terms"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Terms
          </a>{' '}
          and{' '}
          <a
            href="https://app.lervit.com/privacy"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Privacy Policy
          </a>
          .
        </p>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        {step > 1 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((step - 1) as 1 | 2 | 3)}
            disabled={isSubmitting}
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        ) : (
          <span />
        )}

        {step === 1 && (
          <Button type="button" disabled={!step1Valid} onClick={() => setStep(2)}>
            Next: Your Vehicle <ArrowRight className="w-4 h-4" />
          </Button>
        )}
        {step === 2 && (
          <Button type="button" disabled={!step2Valid} onClick={() => setStep(3)}>
            Next: Availability <ArrowRight className="w-4 h-4" />
          </Button>
        )}
        {step === 3 && (
          <Button type="button" disabled={!step3Valid || isSubmitting} onClick={onSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
              </>
            ) : (
              <>
                <Truck className="w-4 h-4" /> Apply Now — It's Free
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </>
  )
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {[1, 2, 3].map(s => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold',
              step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            {step > s ? <CheckCircle className="w-4 h-4" /> : s}
          </div>
          {s < 3 && (
            <div className={cn('h-0.5 w-12', step > s ? 'bg-primary' : 'bg-muted')} />
          )}
        </div>
      ))}
      <span className="ml-2 text-sm text-muted-foreground">{STEP_LABELS[step - 1]}</span>
    </div>
  )
}

function StepAbout({ form, setForm }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>> }) {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight mb-2">Join LervIT as a Mover</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Earn $25–250/hr on your schedule. Approved in 24–48 hours.
      </p>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 mb-6 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
          <span>Training provided on day one</span>
        </div>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary shrink-0" />
          <span>Approved in 24–48 hours</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
          <span>Same-day payouts via Stripe</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ma-name">Full Name <span className="text-destructive">*</span></Label>
          <Input
            id="ma-name"
            type="text"
            autoComplete="name"
            required
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ma-phone">Phone <span className="text-destructive">*</span></Label>
          <Input
            id="ma-phone"
            type="tel"
            autoComplete="tel"
            placeholder="(403) 555-0123"
            required
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/[^\d\s\-\(\)\+]/g, '') }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ma-email">Email <span className="text-destructive">*</span></Label>
          <Input
            id="ma-email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ma-neighbourhood">Calgary Neighbourhood</Label>
          <select
            id="ma-neighbourhood"
            value={form.neighbourhood}
            onChange={e => setForm(f => ({ ...f, neighbourhood: e.target.value }))}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Select…</option>
            {NEIGHBOURHOODS.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>
    </>
  )
}

function StepVehicle({ form, setForm }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>> }) {
  return (
    <>
      <h2 className="text-2xl font-bold tracking-tight mb-2">Tell us about your vehicle</h2>
      <p className="text-sm text-muted-foreground mb-6">
        This helps us match you with the right jobs.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {VEHICLE_OPTIONS.map(v => {
          const active = form.vehicleType === v.id
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setForm(f => ({ ...f, vehicleType: v.id }))}
              className={cn(
                'p-4 rounded-xl border-2 text-left transition-all duration-200',
                active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
              )}
            >
              <v.icon className="w-6 h-6 mb-2 text-primary" />
              <p className="font-semibold text-sm">{v.label}</p>
              <p className="text-xs text-muted-foreground">{v.desc}</p>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="space-y-1.5">
          <Label htmlFor="ma-year">Vehicle Year</Label>
          <select
            id="ma-year"
            value={form.vehicleYear}
            onChange={e => setForm(f => ({ ...f, vehicleYear: e.target.value }))}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Select…</option>
            {YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ma-make">Vehicle Make</Label>
          <Input
            id="ma-make"
            type="text"
            placeholder="Ford, Toyota, RAM…"
            value={form.vehicleMake}
            onChange={e => setForm(f => ({ ...f, vehicleMake: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Can you move furniture?</Label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, canMoveFurniture: true }))}
            className={cn(
              'p-3 rounded-lg border-2 text-sm text-left transition-all',
              form.canMoveFurniture ? 'border-primary bg-primary/5 font-semibold' : 'border-border',
            )}
          >
            Yes, I can move furniture
          </button>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, canMoveFurniture: false }))}
            className={cn(
              'p-3 rounded-lg border-2 text-sm text-left transition-all',
              !form.canMoveFurniture ? 'border-primary bg-primary/5 font-semibold' : 'border-border',
            )}
          >
            Small items and boxes only
          </button>
        </div>
      </div>
    </>
  )
}

function StepAvailability({ form, setForm }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>> }) {
  return (
    <>
      <h2 className="text-2xl font-bold tracking-tight mb-2">When can you work?</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Pick the times that fit your schedule.
      </p>

      <div className="space-y-2 mb-6">
        {AVAILABILITY_SLOTS.map(slot => {
          const checked = form.availability.includes(slot)
          return (
            <label
              key={slot}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={e =>
                  setForm(f => ({
                    ...f,
                    availability: e.target.checked
                      ? [...f.availability, slot]
                      : f.availability.filter(s => s !== slot),
                  }))
                }
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm">{slot}</span>
            </label>
          )
        })}
      </div>

      <div className="space-y-1.5 mb-6">
        <Label>Minimum jobs per week</Label>
        <div className="space-y-2">
          {JOBS_PER_WEEK.map(j => (
            <label
              key={j.value}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                form.minJobsPerWeek === j.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
              )}
            >
              <input
                type="radio"
                name="jobs-per-week"
                checked={form.minJobsPerWeek === j.value}
                onChange={() => setForm(f => ({ ...f, minJobsPerWeek: j.value }))}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm">{j.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ma-referral">How did you hear about us?</Label>
        <select
          id="ma-referral"
          value={form.referralSource}
          onChange={e => setForm(f => ({ ...f, referralSource: e.target.value }))}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Select…</option>
          {REFERRAL_SOURCES.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
    </>
  )
}

function SuccessScreen() {
  const nextSteps = [
    'Jordan reviews your application',
    'Quick onboarding call (15 min)',
    'Stripe account setup for payouts',
    'First job within 48 hours',
  ]
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-6">
        <CheckCircle className="w-10 h-10 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Application received!</h2>
      <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
        Jordan from LervIT will contact you within 24 hours to get you set up and earning.
      </p>
      <div className="bg-muted/50 rounded-xl p-6 text-left max-w-sm mx-auto mb-8">
        <p className="font-semibold text-sm mb-3">What happens next:</p>
        <div className="space-y-2.5">
          {nextSteps.map((s, i) => (
            <div key={i} className="flex items-center gap-2.5 text-sm">
              <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                {i + 1}
              </div>
              {s}
            </div>
          ))}
        </div>
      </div>
      <a href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
        ← Back to LervIT
      </a>
    </div>
  )
}

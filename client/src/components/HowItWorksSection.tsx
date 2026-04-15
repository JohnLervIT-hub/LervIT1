import step1Img from "@assets/generated_images/how_it_works_step1.png";
import step2Img from "@assets/generated_images/how_it_works_step2.png";
import step3Img from "@assets/generated_images/how_it_works_step3.png";

const steps = [
  {
    number: "1",
    title: "Enter Your Details",
    body: "Enter locations, upload photos of items and get smart price estimates.",
    image: step1Img,
    badgeBg: "bg-violet-600",
    arrowColor: "#a78bfa",
  },
  {
    number: "2",
    title: "Get Your Price",
    body: "See your upfront price before you book. No calls. No negotiation.",
    image: step2Img,
    badgeBg: "bg-blue-500",
    arrowColor: "#60a5fa",
  },
  {
    number: "3",
    title: "Book and Track",
    body: "Confirm your booking, get matched with a verified mover, and track the move live.",
    image: step3Img,
    badgeBg: "bg-emerald-500",
    arrowColor: null,
  },
];

function Arrow({ color }: { color: string }) {
  return (
    <div className="hidden md:flex items-center justify-center self-center w-10 flex-shrink-0 -mt-16">
      <svg width="40" height="24" viewBox="0 0 40 24" fill="none">
        <path
          d="M0 12 C10 4, 30 20, 38 12"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M32 8 L38 12 L32 16"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-16 md:py-20 lg:py-24 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12 md:mb-16 space-y-3">
          <h2 className="text-3xl md:text-4xl font-bold">How LervIT Works</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            From quote to mover at your door —{" "}
            <span className="font-semibold text-foreground">in minutes, not hours.</span>
          </p>
        </div>

        {/* Cards + arrows row */}
        <div className="flex flex-col md:flex-row items-stretch gap-4 md:gap-0">
          {steps.map((step, i) => (
            <div key={i} className="flex md:flex-row items-stretch flex-1 min-w-0">
              {/* Card */}
              <div
                className="flex flex-col w-full rounded-2xl bg-white dark:bg-card border border-border shadow-sm overflow-hidden"
                data-testid={`step-${i}`}
              >
                {/* Step badge + title */}
                <div className="flex flex-col items-center pt-5 pb-3 px-5">
                  <div className={`w-12 h-12 rounded-full ${step.badgeBg} flex items-center justify-center shadow-md mb-3`}>
                    <span className="text-white font-bold text-2xl leading-none">{step.number}</span>
                  </div>
                  <h3 className="font-bold text-base text-left w-full">
                    <span className="text-muted-foreground mr-1">&gt;</span>
                    {step.title}
                  </h3>
                </div>

                {/* Illustration */}
                <div className="flex-1 flex items-center justify-center px-4 pb-2">
                  <img
                    src={step.image}
                    alt={step.title}
                    className="w-full max-h-52 object-contain"
                    draggable={false}
                  />
                </div>

                {/* Divider + text */}
                <div className="border-t border-border mx-0" />
                <div className="px-5 py-4 text-center">
                  <h4 className="font-bold text-base mb-1">{step.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
                </div>
              </div>

              {/* Arrow between cards */}
              {step.arrowColor && <Arrow color={step.arrowColor} />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

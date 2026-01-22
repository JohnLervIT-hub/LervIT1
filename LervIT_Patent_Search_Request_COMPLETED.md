# Alberta Innovates - IP/Patent Search Request Form
## LervIT - Smart Moving Platform

---

## BASIC INFORMATION

| Field | Entry |
|-------|-------|
| **Date Requested** | January 22, 2026 |
| **Date Required** | [Your preferred date] |
| **TDA Name** | [Your TDA's name] |
| **TDA Email** | [Your TDA's email] |
| **TDA Phone #** | [Your TDA's phone] |
| **Client** | LervIT / [Your Name] |

---

## OUTPUT REQUESTED

- [x] **Patent Search**
- [x] **Literature Search**
- [x] **Market Search**

---

## DESCRIPTION OF TOPIC

**Concise Statement:**

LervIT is an AI-powered two-sided marketplace platform that connects customers needing moving services with freelance movers. The platform's core innovation is a **computer vision-based load estimation and pricing system** that uses GPT-4o Vision AI to analyze photographs of household items, automatically identify furniture types, estimate physical dimensions and volume, and generate instant moving quotes without human intervention.

**What Makes It Unique:**

1. **Photo-to-Quote AI System** - First application of large language model (LLM) vision capabilities to the moving/logistics industry for automated load assessment and pricing

2. **Three-Layer Vision Processing Pipeline** - Combines real-time AI vision detection with a ground-truth furniture database and algorithmic dimension correction rules

3. **Dynamic Proximity-Based Mover Matching** - Algorithm that ranks available service providers by distance, availability, vehicle capacity, and pricing in real-time (similar to ride-sharing but for moving services)

---

## MORE SPECIFIC DETAILS

**Technical Features (Non-Confidential):**

**1. AI Vision Engine Architecture:**
- Accepts user-uploaded photographs of items to be moved
- Processes images through OpenAI's GPT-4o Vision API with custom prompting
- Extracts: item name, category, estimated dimensions, weight class, handling complexity
- Cross-references against a curated database of 100+ common furniture items with verified dimensions
- Applies correction algorithms for known AI estimation errors (e.g., sofas often underestimated, lamps overestimated)
- Outputs: cubic footage volume, recommended vehicle type, number of movers required, price estimate

**2. Multi-Item Aggregation:**
- System processes multiple photographs per booking request
- Aggregates individual item volumes into total load assessment
- Determines optimal vehicle class based on cumulative volume thresholds
- Adjusts pricing dynamically based on load complexity

**3. Proximity Matching Algorithm:**
- Uses Google Maps Distance Matrix API for accurate driving distance/time calculations
- Ranks available movers within configurable radius (15-50km)
- Factors: distance, mover rating, vehicle match, pricing, availability
- Returns top 5 candidates with real-time ETA and pricing

**4. Real-Time Tracking System:**
- GPS-based location sharing during active moves
- WebSocket connections for live position updates
- Customer-facing map interface with route visualization

**Comparison Reference:**
- Similar market positioning to Lugg (USA) and Dolly (USA) but with added AI photo-based quoting
- Uber/Lyft model applied to moving services with AI-enhanced load estimation

---

## KEYWORDS & SYNONYMS

**Primary Keywords:**
- Computer vision load estimation
- AI-powered moving quote
- Photo-based freight assessment
- Machine learning furniture identification
- Automated volume calculation
- Vision API logistics
- LLM image analysis pricing

**Technical Keywords:**
- GPT-4 Vision moving
- Furniture dimension estimation AI
- Load size prediction algorithm
- Vehicle capacity matching
- Proximity-based service matching
- Real-time GPS tracking logistics
- Two-sided marketplace moving

**Industry Keywords:**
- On-demand moving platform
- Gig economy logistics
- Freelance mover marketplace
- Last-mile moving services
- Household goods transportation
- Local moving technology

---

## AUTHORS OF INTEREST

- OpenAI research team (Vision/GPT-4 papers)
- Google Maps Platform technical publications
- Uber engineering blog (proximity matching, dynamic pricing)
- Academic papers on furniture recognition/object detection
- Logistics automation research

---

## PURPOSE OF SEARCH

**Primary Purpose:** 
Preliminary search for similar existing patents related to:
1. AI/computer vision systems for estimating moving loads from photographs
2. Automated pricing systems for logistics/moving services based on image analysis
3. Proximity-based matching algorithms for on-demand labor marketplaces
4. Real-time tracking systems for moving/delivery services

**Secondary Purpose:**
- Competitive intelligence on existing moving technology platforms
- Market landscape analysis for AI-powered logistics solutions
- Overview of technology patents held by competitors (Lugg, Dolly, TaskRabbit, etc.)

**Note:** We understand results are not conclusive as to uniqueness or patentability.

---

## PREFERENCES

| Setting | Selection |
|---------|-----------|
| **Languages** | English Language Only |
| **Years** | From: 2018 To: 2026 |
| **Geographic** | All (with emphasis on USA, Canada) |
| **Format** | Abstracts, if available |
| **Delivery** | By email |

---

## ADDITIONAL CONTEXT

**Key Differentiators to Search Against:**
1. Use of large language models (LLMs) specifically GPT-4 Vision for furniture identification
2. Three-layer processing: AI detection → database matching → algorithmic correction
3. Integration of vision-based load estimation with dynamic pricing and mover matching
4. Mobile-first platform with real-time GPS tracking

**Potential Patent Classes to Consider:**
- G06Q 10/08 (Logistics)
- G06Q 30/02 (E-commerce, pricing)
- G06V 20/00 (Image analysis)
- G06N 3/08 (Neural networks, machine learning)
- G01G (Weighing/measuring)

---

*Form prepared for Alberta Innovates TDA Program*
*LervIT - Smart Moving Platform*
*January 2026*

# Brewing Software Landscape

## Homebrewer-Focused Tools

### Brewfather
- **URL:** brewfather.app | **Model:** Freemium, ~$30/yr premium | **Target:** Homebrewers
- Recipe designer with auto OG/FG/ABV/IBU/SRM calculations, batch tracking, inventory, water chemistry, brew timer, recipe sharing/community library
- Best-in-class device integrations: Tilt, Brewtools, RAPT, Plaato, SmartPID, iSpindel, Grainfather, plus custom API
- PWA + native iOS/Android. Modern UI, widely considered the best UX in the space
- Pain points: recent price increase ($20 to $30) caused backlash, inventory management could be deeper

### BeerSmith
- **URL:** beersmith.com | **Model:** $20/yr subscription | **Target:** Homebrew + pro
- Most comprehensive feature set: deep equipment profiles, advanced calculations, water chemistry, mash designer, shopping lists
- Desktop app (Win/Mac/Linux) + web version. BeerSmith 4 in development (years now)
- UI universally described as "dated" or "comically outdated" but calculations are the most accurate once equipment profiles are configured
- Steep learning curve, especially around equipment profile setup

### Brewer's Friend
- **URL:** brewersfriend.com | **Model:** ~$10/yr | **Target:** Homebrewers
- Clean web UI, good water calculators, recipe scaling, brew session tracking, inventory
- Recently added mobile apps. Very affordable
- Some questions about FG estimate accuracy vs BeerSmith

### Brewtarget (Open Source)
- **URL:** github.com/Brewtarget/brewtarget | **License:** GPL-3.0
- 348 stars, 57 contributors, actively maintained (v5.0.3 released Feb 2026)
- Desktop app (C++), drag-and-drop recipe builder, BeerXML + BeerJSON import/export, inventory
- Free alternative for users who refuse subscriptions. UI considered dated

## Commercial Brewery Management

### Ekos (GoTab)
- **URL:** goekos.com | **Model:** SaaS, quote-based | **Target:** Mid-to-large craft breweries
- Industry leader: production tracking, inventory, sales/distribution, TTB reporting, QuickBooks/Xero integration
- Some find it complex for small operations

### Beer30 (The 5th Ingredient)
- Grain-to-glass production data focus, fermentation monitoring, mobile data entry
- More brew-centric than full ERP solutions

### Brew Ninja
- ~$289/mo base + add-ons | Modular approach (production, sales, keg tracking)
- Positioned as affordable Ekos alternative for small/mid breweries

### Breww
- Starting ~$30/mo, volume-tiered | Strong in UK market
- Modern cloud platform, compliance focus, beer duty management

### Others
- **Orchestrated Beer** — powerful but complex, premium-priced, better for larger ops
- **Crafted ERP** — built on NetSuite, enterprise-grade, multi-location
- **Ollie Ops** — distinguished by integrated task management for brewery floor teams

## Open Source / Process Automation

### CraftBeerPi 4
- github.com/craftbeerpi/craftbeerpi4 | GPL-3.0 | Python + Raspberry Pi
- Plugin-based brewing/fermentation automation with web UI, Docker support
- Development appears stalled (~4 years since last commit)

### BrewPi
- Fermentation temperature control firmware (C) for Arduino/Particle Photon
- Evolved into commercial BrewPi Spark while keeping open source codebase

### brewcalc
- github.com/brewcomputer/brewcalc | MIT | TypeScript/JavaScript
- Calculation library (OG, FG, ABV, IBU, SRM) — not a full app but reusable engine
- 128 stars, inactive (~5 years)

### BeerJSON
- github.com/beerjson/beerjson | MIT | 158 stars
- The emerging standard for recipe interchange (successor to BeerXML)
- JSON Schema defining recipes, fermentables, hops, yeast, mash steps, fermentation, water, styles
- Brewtarget already supports it. Critical to understand for data portability

## Data Formats

| Format | Status | Notes |
|--------|--------|-------|
| **BeerXML** | Legacy standard | Widely supported, verbose XML, lacks modern brewing concepts |
| **BeerJSON** | Emerging standard | JSON Schema, more expressive, MIT licensed, growing adoption |

## Common Pain Points (from r/Homebrewing, r/TheBrewery)

1. **UI quality** — BeerSmith is powerful but looks terrible; Brewfather is pretty but less deep
2. **Subscription fatigue** — strong resistance to recurring fees in the homebrew community
3. **Data portability** — fear of vendor lock-in, want bulk BeerXML/JSON export
4. **Poor mobile experience** — older desktop tools lack brewery-floor usability
5. **Units/measurements** — tools show "5.25 lbs" instead of "5 lbs 4 oz"
6. **Water chemistry** — usually bolted-on afterthought, not first-class
7. **Batch versioning** — no tool handles "I brewed 3 variations of this recipe, compare results" well

## Features Brewers Wish Existed

- Offline-capable with full functionality (not cloud-dependent)
- Integrated brew session tracking: recipe through fermentation to packaging
- Recipe snapshots/versioning (record brew-day changes without altering base recipe)
- Better data export and import (especially from spreadsheets)
- Customizable brew day printouts
- Plugin/extension architecture
- Brewer-friendly unit display

## The Spreadsheet Workflow (our user's current state)

Spreadsheet brewers typically maintain:
- Separate tabs for grains, hops, yeast, water chemistry
- Formula-driven calculations (ABV, IBU, SRM, mash pH)
- Inventory tracking with lot numbers and cost-per-batch
- Batch logging with OG, FG, fermentation temps, process notes
- Equipment profiles for their specific brewing system

**Why they stay:** Full customization, no subscription, total control, familiar interface
**Why they leave:** No device integration, no collaboration, manual entry errors, no mobile access

## Market Gaps (Opportunities for Rockcut)

1. **No homebrew-to-pro bridge** — brewers who outgrow Brewfather/BeerSmith hit a cliff before Ekos makes sense
2. **Recipe versioning is weak everywhere** — experiment tracking and comparison is underserved
3. **Spreadsheet migration is painful** — no tool makes it easy to import existing workbook data
4. **No modern open-source web app** — Brewtarget is C++ desktop only
5. **Batch cost analysis** — cost per batch, cost per pint, ingredient cost trends are underserved
6. **Water chemistry as first-class citizen** — usually an afterthought in existing tools

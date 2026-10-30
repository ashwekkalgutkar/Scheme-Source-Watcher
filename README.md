# Scheme Source Watcher

> An automated monitor for Indian government welfare scheme pages that detects meaningful policy updates (amounts, deadlines, eligibility limits) while eliminating alert fatigue from routine cosmetic changes.

---

## Overview & Design Principles

Government departments regularly update scheme pages without prior announcement. However, typical change detection tools flood reviewers with noisy notifications whenever a visitor counter ticks up, a marquee notice banner changes, or a "Last updated" stamp is refreshed.

**Scheme Source Watcher** solves this by:
1. **Normalizing HTML**: Stripping headers, footers, navigation, scripts, marquees, visitor counters, and banner tickers using `cheerio`.
2. **Deterministic Fact Extraction**: Parsing benefit amounts, application deadlines, income thresholds, and age criteria using Indian numbering systems (Lakh, Crore, Indian comma notation) and ISO date normalization.
3. **Fact-Based Classification**: Comparing extracted facts by `(type, key)`. Alerts are **only** generated when a policy fact is added, changed, or removed.
4. **Honesty about Limits**: Transparently bucketing ambiguous rewrites into a low-priority "text changed, needs a look" review queue without triggering high-priority alerts.

---

## Project Structure

```
assignment/
├── server/
│   ├── src/
│   │   ├── fetcher.js          # Fetcher with conditional GET, robots.txt, manual redirects, retries
│   │   ├── normalizer.js       # Cheerio HTML cleaner & text similarity
│   │   ├── factExtractor.js    # Deterministic rule engine for amounts, dates, income, age
│   │   ├── classifier.js       # Change categorization (meaningful, cosmetic, text_changed, unchanged)
│   │   ├── screenshot.js       # Playwright Chromium 1280x1600 full-page screenshot capture
│   │   ├── checker.js          # Core orchestration engine & deduplicated review items
│   │   ├── scheduler.js        # node-cron scheduler with per-source intervals
│   │   ├── db.js               # MongoDB connection with in-memory fallback
│   │   ├── app.js              # Express REST API
│   │   ├── index.js            # Server entry point (port 4000)
│   │   └── models/             # Mongoose schemas (Source, Snapshot, ReviewItem, CheckLog)
│   ├── fixtures/
│   │   ├── server.js           # Demo Fixture Server (port 4001)
│   │   └── templates.js        # Realistic Indian government scheme HTML & CSS
│   ├── scripts/
│   │   └── seed.js             # Seed script for 4 initial scheme sources
│   ├── tests/                  # 40 Jest tests covering all modules & scenarios A-H
│   └── package.json
├── client/                     # React dashboard (Create React App structure, plain CSS)
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js              # Review queue, diff visualizer, fixture controller, audit logs
│   │   ├── App.css             # Vanilla CSS design system
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
└── README.md
```

---

## Quickstart

### Prerequisites
- Node.js 20 (`v20.x`)
- npm

### 1. Run Tests (Verifying All Scenarios)
All 40 unit and integration tests run self-contained:
```bash
cd server
npm test
```

### 2. Start the Fixture Server (Port 4001)
The fixture server serves 4 realistic fake Indian department scheme pages:
```bash
cd server
npm run fixtures
```

### 3. Seed Database & Start Watcher Server (Port 4000)
If `MONGO_URI` is unset, the server automatically starts an in-memory MongoDB instance:
```bash
cd server
npm run seed
npm run dev
```

### 4. Open the Reviewer Dashboard
Open `client/public/index.html` in your web browser, or run:
```bash
cd client
npm start
```

---

## Scenario Verification Matrix (A through H)

| Scenario | Simulated Action | Detection Behavior | Outcome |
| :--- | :--- | :--- | :--- |
| **A. Cosmetic Only** | Visitor counter increments, marquee notice ticker changes, "Last updated" date updates, nav link added. | Normalizer strips dynamic counters and notices. Facts remain identical. | **NO alert created**. CheckLog records `ignored: only cosmetic elements differed`. |
| **B. Meaningful Benefit Amount** | Benefit amount changes: `"Rs 6,000 per year"` $\rightarrow$ `"Rs 8,000 per year"`. | Amount extractor parses Indian digit format & annual frequency. | **High-priority review item** created (`amount:benefit_amount: 6000/year -> 8000/year`). Deduplicated on repeat checks. |
| **C. Meaningful Deadline vs Wording Change** | Deadline changes: `"31 March 2026"` $\rightarrow$ `"30 June 2026"`.<br>Wording changes from `"31 March 2026"` to `"31/03/2026"`. | Dates normalized to ISO `YYYY-MM-DD`. Dates inside `"last updated / as on"` contexts are ignored. | **Alerts** for actual date change. **NO alert** when only phrasing changes with identical ISO date. |
| **D. Meaningful Income & Age** | Income limit: `Rs 2.5 lakh` $\rightarrow$ `Rs 3 lakh`.<br>Age threshold: `60 years` $\rightarrow$ `58 years`. | Lakh numbers normalized to standard rupees (`250000` $\rightarrow$ `300000`). Age normalized to integers (`60` $\rightarrow$ `58`). | **High-priority review item** created with both criteria changes. |
| **E. Moved Source** | URL returns HTTP `301 Moved Permanently` to a new portal. | Manual redirect handler records hop chain. Permanently updates `source.currentUrl`. | Source marked `moved`. **Medium-priority `source_moved` notice** raised. |
| **F. Dead Source** | Endpoint returns `404 Not Found` or `410 Gone`. | Flagged as dead. Retries not wasted on definitive 4xx. | Source marked `dead`. **`source_dead` review item** raised. |
| **G. Blocked Source** | Endpoint returns `403 Forbidden`, `429 Too Many Requests`, or `robots.txt` disallows `SchemeWatcher`. | Never evades blocking (no UA spoofing, no proxies). Respects `Retry-After: 60`. | Source marked `blocked`. **`source_blocked` review item** raised. Auto-resolved when source recovers. |
| **H. Ambiguous Rewrite** | Eligibility paragraph rewritten substantially, but facts remain identical. | Text similarity drops below `0.85` while fact sets remain matching. | **Low-priority `text_changed` bucket** ("needs a look"). **NOT** a critical alert. |

---

## Known Gaps & Acknowledged Limitations

1. **Numbers in English Words**:
   Phrases such as *"twelve thousand rupees"* or *"sixty years"* are intentionally skipped by the deterministic regex extractor. Only numeric and unit-qualified amounts (*"Rs 12,000"*, *"₹6000"*, *"Rs 2.5 lakh"*, *"60 years"*) are parsed.
2. **Linked PDF & Scanned Circulars**:
   Many Indian government departments post guidelines as scanned PDF circulars. This watcher parses HTML content and does not OCR external PDF downloads.
3. **Complex Multi-Tier Formulas**:
   Subsidies that involve complex conditional equations across multiple household parameters are simplified to primary threshold facts (income limit, unit amount, target age).

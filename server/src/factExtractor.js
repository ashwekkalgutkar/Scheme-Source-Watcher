/**
 * Scheme Source Watcher - Fact Extractor
 *
 * Implements deterministic rule-based fact extraction:
 * - Amount: "Rs 6,000", "₹6000", "Rs. 2.5 lakh", "Rs 1,00,000" (Indian digit grouping), lakh/crore normalized to rupees, frequency (per year/annum/month)
 * - Deadline: "31 March 2026", "31/03/2026", "31-Mar-2026", "March 31, 2026" normalized to ISO YYYY-MM-DD
 * - Context filtering: Ignore dates in "last updated/modified/visited/as on" contexts
 * - Eligibility Income: "annual family income below Rs 2.5 lakh" -> normalized rupees
 * - Eligibility Age: "60 years", "age 58 years", "at least 60 years" -> normalized age
 * - Nearest heading tracking for location tagging
 *
 * KNOWN GAP:
 * Numbers written in English words (e.g. "twelve thousand", "sixty years", "five lakh")
 * are skipped and documented as an acknowledged limitation of the deterministic regex engine.
 */

const { normalizeHtml } = require('./normalizer');

// Month mapping
const MONTHS = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12'
};

/**
 * Parse an Indian currency/number string into a normalized number
 * Handles:
 * - "Rs 6,000", "₹6,000", "Rs. 2.5 lakh", "1.5 crore", "Rs 1,00,000"
 */
function parseIndianAmount(amountStr) {
  if (!amountStr) return null;
  const str = amountStr.replace(/,/g, '').trim().toLowerCase();

  // Match: number followed by optional lakh/crore
  const lakhMatch = str.match(/([\d.]+)\s*(?:lakh|lacs?|lac)/i);
  if (lakhMatch) {
    const val = parseFloat(lakhMatch[1]);
    return Math.round(val * 100000);
  }

  const croreMatch = str.match(/([\d.]+)\s*(?:crore|cr)/i);
  if (croreMatch) {
    const val = parseFloat(croreMatch[1]);
    return Math.round(val * 10000000);
  }

  // Pure digits with optional decimals
  const pureNumMatch = str.match(/[\d.]+/);
  if (pureNumMatch) {
    return Math.round(parseFloat(pureNumMatch[0]));
  }

  return null;
}

/**
 * Extract frequency from surrounding text (year/annum/month)
 */
function extractFrequency(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/per\s+(?:year|annum)|annual(?:ly)?/i.test(lower)) return 'year';
  if (/per\s+month|monthly/i.test(lower)) return 'month';
  if (/per\s+installment|per\s+instalment/i.test(lower)) return 'installment';
  if (/one[- ]time|lump\s*sum/i.test(lower)) return 'one-time';
  return null;
}

/**
 * Normalize date string to ISO YYYY-MM-DD
 */
function normalizeDate(dayStr, monthStr, yearStr) {
  const day = String(dayStr).padStart(2, '0');
  const monthKey = String(monthStr).toLowerCase().trim();
  let month = MONTHS[monthKey];
  if (!month) {
    // If numeric month
    const num = parseInt(monthStr, 10);
    if (!isNaN(num) && num >= 1 && num <= 12) {
      month = String(num).padStart(2, '0');
    }
  }
  if (!month) return null;
  const year = String(yearStr);
  return `${year}-${month}-${day}`;
}

/**
 * Check if a date match is inside an ignored context
 * ("last updated", "modified on", "visited on", "as on", etc.)
 */
function isDateInIgnoredContext(fullText, matchIndex, matchLength) {
  const start = Math.max(0, matchIndex - 60);
  const end = Math.min(fullText.length, matchIndex + matchLength + 40);
  const windowText = fullText.substring(start, end).toLowerCase();

  const ignoredPattern = /last\s+(?:updated|modified|visited|reviewed)|updated\s+(?:on|as\s+of)|modified\s+on|as\s+on\s+\d|published\s+on/i;
  return ignoredPattern.test(windowText);
}

/**
 * Extract facts from HTML or normalized sections
 *
 * @param {string|object} input - HTML string or normalized object from normalizeHtml
 * @returns {Array<object>} [{ type, key, value, rawQuote, location }]
 */
function extractFacts(input) {
  let normalized;
  if (typeof input === 'string') {
    normalized = normalizeHtml(input);
  } else if (input && input.sections) {
    normalized = input;
  } else {
    return [];
  }

  const { sections, mainText } = normalized;
  const facts = [];

  // Helper to prevent exact duplicates
  const addFact = (type, key, value, rawQuote, location) => {
    if (value === null || value === undefined) return;
    const exists = facts.some(f => f.type === type && f.key === key && JSON.stringify(f.value) === JSON.stringify(value));
    if (!exists) {
      facts.push({
        type,
        key,
        value,
        rawQuote: rawQuote ? rawQuote.trim() : '',
        location: location || 'General'
      });
    }
  };

  // Process section by section for precise location (nearest heading)
  const itemsToProcess = sections && sections.length > 0
    ? sections
    : [{ heading: 'General', text: mainText, tag: 'body' }];

  for (const item of itemsToProcess) {
    const text = item.text;
    const heading = item.heading || 'General';

    // -------------------------------------------------------------
    // 1. ELIGIBILITY INCOME
    // e.g. "annual family income below Rs 2.5 lakh", "annual income does not exceed Rs 3 lakh"
    // -------------------------------------------------------------
    const incomePattern = /(?:family\s+income|annual\s+income|household\s+income)(?:[^.!?;\n]{0,80}?)(?:below|less\s+than|not\s+exceed(?:ing)?|up\s*to|upto|maximum\s+of)?\s*(?:(?:rs\.?|₹)\s*[\d,.]+(?:\s*(?:lakh|lac|crore))?)/gi;
    let incomeMatch;
    while ((incomeMatch = incomePattern.exec(text)) !== null) {
      const rawQuote = incomeMatch[0];
      const amtMatch = rawQuote.match(/(?:rs\.?|₹)\s*[\d,.]+(?:\s*(?:lakh|lac|crore))?/i);
      if (amtMatch) {
        const parsed = parseIndianAmount(amtMatch[0]);
        if (parsed) {
          addFact('eligibility_income', 'family_income_limit', parsed, rawQuote, heading);
        }
      }
    }

    // Secondary pattern: "annual family income of Rs 2.5 lakh or less"
    const secondaryIncomePattern = /(?:family|annual|household)\s+income\s*(?:is|should\s+be)?\s*(?:below|under|within|less\s+than)\s*(?:rs\.?|₹)\s*[\d,.]+(?:\s*(?:lakh|lac|crore))?/gi;
    let secMatch;
    while ((secMatch = secondaryIncomePattern.exec(text)) !== null) {
      const rawQuote = secMatch[0];
      const amtMatch = rawQuote.match(/(?:rs\.?|₹)\s*[\d,.]+(?:\s*(?:lakh|lac|crore))?/i);
      if (amtMatch) {
        const parsed = parseIndianAmount(amtMatch[0]);
        if (parsed) {
          addFact('eligibility_income', 'family_income_limit', parsed, rawQuote, heading);
        }
      }
    }

    // -------------------------------------------------------------
    // 2. ELIGIBILITY AGE
    // e.g. "age 60 years", "attained the age of 60 years", "minimum age 18 years", "58 years of age"
    // -------------------------------------------------------------
    const agePattern = /(?:(?:minimum|maximum|atleast|at\s+least)?\s*age\s*(?:of|is|limit)?\s*(\d{1,3})\s*(?:years|yrs)?)|(?:(\d{1,3})\s*years\s*(?:of\s+age|and\s+above|or\s+above))/gi;
    let ageMatch;
    while ((ageMatch = agePattern.exec(text)) !== null) {
      const rawQuote = ageMatch[0];
      // Exclude income-related or year numbers (e.g., year 2026)
      const ageNum = parseInt(ageMatch[1] || ageMatch[2], 10);
      if (!isNaN(ageNum) && ageNum >= 1 && ageNum <= 120) {
        // Distinguish min vs max or general age
        let key = 'beneficiary_age';
        if (/minimum|at\s+least|above/i.test(rawQuote)) {
          key = 'min_age';
        } else if (/maximum|upto|up\s+to|below/i.test(rawQuote)) {
          key = 'max_age';
        }
        addFact('eligibility_age', key, ageNum, rawQuote, heading);
      }
    }

    // -------------------------------------------------------------
    // 3. BENEFIT AMOUNT
    // e.g. "Rs 6,000 per year", "₹8000 per year", "Rs. 2.5 lakh", "Rs 1,00,000"
    // Skip if already captured as income limit
    // -------------------------------------------------------------
    const amountPattern = /(?:(?:rs\.?|₹)\s*[\d,.]+(?:\s*(?:lakh|lac|crore))?)(?:\s*(?:per\s+(?:year|annum|month)|annually|monthly))?/gi;
    let amtMatch;
    while ((amtMatch = amountPattern.exec(text)) !== null) {
      const rawQuote = amtMatch[0];
      const matchIndex = amtMatch.index;

      // Check if this amount is part of eligibility income
      const surroundingContext = text.substring(Math.max(0, matchIndex - 40), Math.min(text.length, matchIndex + rawQuote.length + 40));
      if (/family\s+income|annual\s+income|household\s+income/i.test(surroundingContext)) {
        continue;
      }

      const parsedAmt = parseIndianAmount(rawQuote);
      if (!parsedAmt) continue;

      const freq = extractFrequency(rawQuote) || extractFrequency(surroundingContext);
      const factValue = freq ? `${parsedAmt}/${freq}` : `${parsedAmt}`;

      let key = 'benefit_amount';
      if (/pension/i.test(surroundingContext) || /pension/i.test(heading)) {
        key = 'pension_amount';
      } else if (/scholarship/i.test(surroundingContext) || /scholarship/i.test(heading)) {
        key = 'scholarship_amount';
      } else if (/subsidy|grant|assistance/i.test(surroundingContext)) {
        key = 'financial_assistance';
      }

      addFact('amount', key, factValue, rawQuote, heading);
    }

    // -------------------------------------------------------------
    // 4. DEADLINE
    // Formats:
    // - "31 March 2026", "31-Mar-2026", "31/03/2026", "March 31, 2026"
    // MUST ignore dates in "last updated", "modified on", "as on" contexts
    // -------------------------------------------------------------

    // Pattern A: DD MonthName YYYY (e.g. "31 March 2026", "31-Mar-2026", "31 March, 2026")
    const datePatternA = /\b(\d{1,2})[- \s]+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[, -]+(\d{4})\b/gi;
    let dateA;
    while ((dateA = datePatternA.exec(text)) !== null) {
      if (isDateInIgnoredContext(text, dateA.index, dateA[0].length)) {
        continue;
      }
      const isoDate = normalizeDate(dateA[1], dateA[2], dateA[3]);
      if (isoDate) {
        addFact('deadline', 'application_deadline', isoDate, dateA[0], heading);
      }
    }

    // Pattern B: MonthName DD, YYYY (e.g. "March 31, 2026", "March 31 2026")
    const datePatternB = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})[, -]+(\d{4})\b/gi;
    let dateB;
    while ((dateB = datePatternB.exec(text)) !== null) {
      if (isDateInIgnoredContext(text, dateB.index, dateB[0].length)) {
        continue;
      }
      const isoDate = normalizeDate(dateB[2], dateB[1], dateB[3]);
      if (isoDate) {
        addFact('deadline', 'application_deadline', isoDate, dateB[0], heading);
      }
    }

    // Pattern C: DD/MM/YYYY or DD-MM-YYYY (e.g. "31/03/2026", "31-03-2026")
    const datePatternC = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g;
    let dateC;
    while ((dateC = datePatternC.exec(text)) !== null) {
      if (isDateInIgnoredContext(text, dateC.index, dateC[0].length)) {
        continue;
      }
      const isoDate = normalizeDate(dateC[1], dateC[2], dateC[3]);
      if (isoDate) {
        addFact('deadline', 'application_deadline', isoDate, dateC[0], heading);
      }
    }
  }

  // Deterministically sort facts by type, key, location, value for stable comparison
  facts.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    if (a.key !== b.key) return a.key.localeCompare(b.key);
    return JSON.stringify(a.value).localeCompare(JSON.stringify(b.value));
  });

  return facts;
}

module.exports = {
  extractFacts,
  parseIndianAmount,
  extractFrequency,
  normalizeDate,
  isDateInIgnoredContext
};

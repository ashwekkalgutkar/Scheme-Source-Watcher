const {
  extractFacts,
  parseIndianAmount,
  normalizeDate,
  isDateInIgnoredContext
} = require('../src/factExtractor');

describe('Fact Extractor', () => {
  describe('parseIndianAmount helper', () => {
    test('parses standard numbers with commas', () => {
      expect(parseIndianAmount('Rs 6,000')).toBe(6000);
      expect(parseIndianAmount('₹6000')).toBe(6000);
      expect(parseIndianAmount('Rs 1,00,000')).toBe(100000);
    });

    test('parses lakh and crore notations', () => {
      expect(parseIndianAmount('Rs. 2.5 lakh')).toBe(250000);
      expect(parseIndianAmount('Rs 3 lakh')).toBe(300000);
      expect(parseIndianAmount('₹1.5 crore')).toBe(15000000);
    });
  });

  describe('normalizeDate helper', () => {
    test('normalizes day month year to ISO YYYY-MM-DD', () => {
      expect(normalizeDate('31', 'March', '2026')).toBe('2026-03-31');
      expect(normalizeDate('31', 'mar', '2026')).toBe('2026-03-31');
      expect(normalizeDate('31', '03', '2026')).toBe('2026-03-31');
      expect(normalizeDate('5', '6', '2026')).toBe('2026-06-05');
    });
  });

  describe('Fact extraction from scheme content', () => {
    test('extracts benefit amount with frequency and nearest heading', () => {
      const html = `
        <h2>Financial Benefits</h2>
        <p>Eligible beneficiaries will receive financial assistance of Rs 6,000 per year in three equal installments.</p>
      `;
      const facts = extractFacts(html);
      const amtFact = facts.find(f => f.type === 'amount');
      expect(amtFact).toBeDefined();
      expect(amtFact.value).toBe('6000/year');
      expect(amtFact.rawQuote).toContain('Rs 6,000 per year');
      expect(amtFact.location).toBe('Financial Benefits');
    });

    test('extracts benefit amount changes: "Rs 6,000 per year" vs "Rs 8,000 per year"', () => {
      const htmlV1 = `<p>Under this scheme, Rs 6,000 per year will be provided.</p>`;
      const htmlV2 = `<p>Under this scheme, Rs 8,000 per year will be provided.</p>`;

      const factsV1 = extractFacts(htmlV1);
      const factsV2 = extractFacts(htmlV2);

      const f1 = factsV1.find(f => f.type === 'amount');
      const f2 = factsV2.find(f => f.type === 'amount');
      expect(f1.value).toBe('6000/year');
      expect(f2.value).toBe('8000/year');
    });

    test('extracts deadlines in multiple formats and normalizes to ISO', () => {
      const htmlA = `<h3>Important Dates</h3><p>Last date for submission is 31 March 2026.</p>`;
      const htmlB = `<h3>Important Dates</h3><p>Application deadline: 31/03/2026.</p>`;
      const htmlC = `<h3>Important Dates</h3><p>Submit documents by 31-Mar-2026.</p>`;
      const htmlD = `<h3>Important Dates</h3><p>Closing date: March 31, 2026.</p>`;

      const fA = extractFacts(htmlA).find(f => f.type === 'deadline');
      const fB = extractFacts(htmlB).find(f => f.type === 'deadline');
      const fC = extractFacts(htmlC).find(f => f.type === 'deadline');
      const fD = extractFacts(htmlD).find(f => f.type === 'deadline');

      expect(fA.value).toBe('2026-03-31');
      expect(fB.value).toBe('2026-03-31');
      expect(fC.value).toBe('2026-03-31');
      expect(fD.value).toBe('2026-03-31');
    });

    test('does NOT alert when deadline wording changes but date is identical', () => {
      const htmlV1 = `<p>Last date for submission is 31 March 2026.</p>`;
      const htmlV2 = `<p>Online portal closes on 31/03/2026 for all applicants.</p>`;

      const f1 = extractFacts(htmlV1).find(f => f.type === 'deadline');
      const f2 = extractFacts(htmlV2).find(f => f.type === 'deadline');
      expect(f1.value).toBe(f2.value); // Both are "2026-03-31"
    });

    test('IGNORES dates inside "last updated/modified/visited/as on" contexts', () => {
      const html = `
        <div class="meta">
          <p>Page last updated on 15 January 2026.</p>
          <p>Data as on 31 March 2025.</p>
          <p>Portal modified on 10/02/2026.</p>
        </div>
        <h2>Application Deadline</h2>
        <p>Final application submission deadline: 30 June 2026.</p>
      `;

      const facts = extractFacts(html);
      const deadlines = facts.filter(f => f.type === 'deadline');
      expect(deadlines).toHaveLength(1);
      expect(deadlines[0].value).toBe('2026-06-30');
    });

    test('extracts eligibility income with Indian lakh normalization', () => {
      const htmlV1 = `
        <h2>Eligibility Criteria</h2>
        <p>The annual family income must be below Rs 2.5 lakh to qualify for assistance.</p>
      `;
      const htmlV2 = `
        <h2>Eligibility Criteria</h2>
        <p>The annual family income must be below Rs 3 lakh to qualify for assistance.</p>
      `;

      const f1 = extractFacts(htmlV1).find(f => f.type === 'eligibility_income');
      const f2 = extractFacts(htmlV2).find(f => f.type === 'eligibility_income');

      expect(f1).toBeDefined();
      expect(f1.value).toBe(250000);
      expect(f1.location).toBe('Eligibility Criteria');

      expect(f2).toBeDefined();
      expect(f2.value).toBe(300000);
    });

    test('extracts eligibility age changes: 60 years -> 58 years', () => {
      const htmlV1 = `
        <h2>Pension Eligibility</h2>
        <p>Applicants must have attained the age of 60 years or above.</p>
      `;
      const htmlV2 = `
        <h2>Pension Eligibility</h2>
        <p>Applicants must have attained the age of 58 years or above.</p>
      `;

      const f1 = extractFacts(htmlV1).find(f => f.type === 'eligibility_age');
      const f2 = extractFacts(htmlV2).find(f => f.type === 'eligibility_age');

      expect(f1).toBeDefined();
      expect(f1.value).toBe(60);
      expect(f1.location).toBe('Pension Eligibility');

      expect(f2).toBeDefined();
      expect(f2.value).toBe(58);
    });

    test('documents and handles numbers in words as known gap', () => {
      const html = `<p>Beneficiaries must have attained twelve thousand rupees and age sixty years.</p>`;
      const facts = extractFacts(html);
      // As per specification, numbers in words ("twelve thousand", "sixty") are skipped
      // and documented as a known gap.
      expect(facts.filter(f => f.type === 'amount')).toHaveLength(0);
    });
  });
});

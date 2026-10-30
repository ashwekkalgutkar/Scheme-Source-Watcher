const { classifySnapshotChange } = require('../src/classifier');

describe('Classifier', () => {
  test('returns unchanged for initial snapshot', () => {
    const res = classifySnapshotChange(null, {
      facts: [{ type: 'amount', key: 'benefit_amount', value: '6000/year' }],
      mainText: 'Test content',
      rawHtmlHash: 'hash-1'
    });
    expect(res.classification).toBe('unchanged');
    expect(res.changes).toHaveLength(0);
  });

  test('classifies meaningful change when benefit amount changes from 6000 to 8000', () => {
    const prev = {
      facts: [
        { type: 'amount', key: 'benefit_amount', value: '6000/year', rawQuote: 'Rs 6,000 per year', location: 'Benefits' },
        { type: 'deadline', key: 'application_deadline', value: '2026-03-31', rawQuote: '31 March 2026', location: 'Dates' }
      ],
      mainText: 'Benefits: Rs 6,000 per year. Apply before 31 March 2026.',
      rawHtmlHash: 'hash-1'
    };

    const next = {
      facts: [
        { type: 'amount', key: 'benefit_amount', value: '8000/year', rawQuote: 'Rs 8,000 per year', location: 'Benefits' },
        { type: 'deadline', key: 'application_deadline', value: '2026-03-31', rawQuote: '31 March 2026', location: 'Dates' }
      ],
      mainText: 'Benefits: Rs 8,000 per year. Apply before 31 March 2026.',
      rawHtmlHash: 'hash-2'
    };

    const res = classifySnapshotChange(prev, next);
    expect(res.classification).toBe('meaningful');
    expect(res.changes).toHaveLength(1);
    expect(res.changes[0]).toMatchObject({
      type: 'amount',
      key: 'benefit_amount',
      before: '6000/year',
      after: '8000/year'
    });
    expect(res.reasons[0]).toContain('changed from 6000/year to 8000/year');
  });

  test('classifies meaningful change when eligibility income changes from 2.5 lakh to 3 lakh', () => {
    const prev = {
      facts: [{ type: 'eligibility_income', key: 'family_income_limit', value: 250000, rawQuote: 'below Rs 2.5 lakh' }],
      mainText: 'Income below Rs 2.5 lakh.',
      rawHtmlHash: 'hash-1'
    };

    const next = {
      facts: [{ type: 'eligibility_income', key: 'family_income_limit', value: 300000, rawQuote: 'below Rs 3 lakh' }],
      mainText: 'Income below Rs 3 lakh.',
      rawHtmlHash: 'hash-2'
    };

    const res = classifySnapshotChange(prev, next);
    expect(res.classification).toBe('meaningful');
    expect(res.changes[0].before).toBe(250000);
    expect(res.changes[0].after).toBe(300000);
  });

  test('classifies cosmetic change when facts are identical but hash differs', () => {
    const prev = {
      facts: [{ type: 'amount', key: 'benefit_amount', value: '6000/year', rawQuote: 'Rs 6,000' }],
      mainText: 'Farmer Support Scheme. Rs 6,000 per year.',
      rawHtmlHash: 'hash-version-1'
    };

    const next = {
      facts: [{ type: 'amount', key: 'benefit_amount', value: '6000/year', rawQuote: 'Rs 6,000' }],
      mainText: 'Farmer Support Scheme. Rs 6,000 per year.',
      rawHtmlHash: 'hash-version-2-after-visitor-increment'
    };

    const res = classifySnapshotChange(prev, next);
    expect(res.classification).toBe('cosmetic');
    expect(res.changes).toHaveLength(0);
    expect(res.reasons[0]).toContain('cosmetic elements');
  });

  test('classifies text_changed (similarity < 0.85) when paragraph is substantially rewritten without fact changes', () => {
    const prev = {
      facts: [{ type: 'deadline', key: 'application_deadline', value: '2026-03-31', rawQuote: '31 March 2026' }],
      mainText: 'All citizen farmers residing in the union territory who cultivate legitimate agrarian parcels must submit their dossier before 31 March 2026 to obtain state aid.',
      rawHtmlHash: 'hash-1'
    };

    const next = {
      facts: [{ type: 'deadline', key: 'application_deadline', value: '2026-03-31', rawQuote: '31/03/2026' }],
      mainText: 'Agricultural landholders seeking government subvention are hereby instructed to forward requisite documentation prior to 31/03/2026 through the digital district registry.',
      rawHtmlHash: 'hash-2'
    };

    const res = classifySnapshotChange(prev, next);
    expect(res.classification).toBe('text_changed');
    expect(res.similarity).toBeLessThan(0.85);
    expect(res.changes).toHaveLength(0);
  });
});

const { normalizeHtml, collapseWhitespace, calculateTextSimilarity } = require('../src/normalizer');

describe('Normalizer', () => {
  test('strips unwanted tags: script, style, noscript, nav, header, footer, aside, marquee', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>.hide { display: none; }</style>
          <script>console.log("tracker");</script>
        </head>
        <body>
          <header><h1>Government Portal Header</h1></header>
          <nav><a href="/home">Home</a><a href="/schemes">Schemes</a></nav>
          <main>
            <h2>Farmer Welfare Support</h2>
            <marquee>Breaking: Applications open for 2026!</marquee>
            <p>Beneficiaries will receive financial aid directly to bank accounts.</p>
            <aside>Related links and ads</aside>
            <noscript>JavaScript is required for interactive features.</noscript>
          </main>
          <footer><p>Copyright 2026 Government of India</p></footer>
        </body>
      </html>
    `;

    const { mainText } = normalizeHtml(html);
    expect(mainText).not.toContain('Government Portal Header');
    expect(mainText).not.toContain('Home');
    expect(mainText).not.toContain('Breaking: Applications open');
    expect(mainText).not.toContain('Related links');
    expect(mainText).not.toContain('JavaScript is required');
    expect(mainText).not.toContain('Copyright 2026');
    expect(mainText).toContain('Farmer Welfare Support');
    expect(mainText).toContain('Beneficiaries will receive financial aid directly to bank accounts.');
  });

  test('strips classes and IDs matching banner|notice-ticker|counter|visitor|breadcrumb|cookie|share', () => {
    const html = `
      <div>
        <div class="top-banner alert-banner">Important Notice: Server maintenance</div>
        <div id="notice-ticker">Today's announcement ticker</div>
        <div class="visitor-counter-box">Total Visitors: 452910</div>
        <span id="page-counter">Hits: 1024</span>
        <nav class="breadcrumb-trail">Home > Schemes > Farmer Support</nav>
        <div id="cookie-consent">We use cookies.</div>
        <div class="share-buttons"><button>Share on Twitter</button></div>
        <h2>Eligible Farmers</h2>
        <p>All landholding farmer families are eligible.</p>
      </div>
    `;

    const { mainText } = normalizeHtml(html);
    expect(mainText).not.toContain('Important Notice: Server maintenance');
    expect(mainText).not.toContain("Today's announcement ticker");
    expect(mainText).not.toContain('Total Visitors');
    expect(mainText).not.toContain('Hits: 1024');
    expect(mainText).not.toContain('Home > Schemes');
    expect(mainText).not.toContain('We use cookies');
    expect(mainText).not.toContain('Share on Twitter');
    expect(mainText).toContain('Eligible Farmers');
    expect(mainText).toContain('All landholding farmer families are eligible.');
  });

  test('strips HTML comments and collapses whitespace', () => {
    const html = `
      <!-- Secret admin comment -->
      <p>
        Line 1     with     extra      spaces.
        <!-- Another inline comment -->
        Line 2.
      </p>
    `;

    const { mainText } = normalizeHtml(html);
    expect(mainText).not.toContain('Secret admin comment');
    expect(mainText).not.toContain('Another inline comment');
    expect(mainText).toBe('Line 1 with extra spaces. Line 2.');
  });

  test('calculates text similarity properly', () => {
    const textA = 'All small and marginal farmers with landholding up to 2 hectares are eligible for financial support.';
    const textB = 'All small and marginal farmers with landholding up to 2 hectares are eligible for financial support.';
    const textC = 'All small and marginal agriculturalists possessing agricultural land up to 2 hectares can qualify.';
    const textD = 'Completely different text about solar subsidies in rural areas.';

    expect(calculateTextSimilarity(textA, textB)).toBe(1.0);
    const simAC = calculateTextSimilarity(textA, textC);
    expect(simAC).toBeGreaterThan(0.2);
    expect(simAC).toBeLessThan(0.85); // Rewritten text drops below 0.85 threshold
    expect(calculateTextSimilarity(textA, textD)).toBeLessThan(0.1);
  });
});

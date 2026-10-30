/**
 * Realistic Indian Government Scheme Webpage Templates & CSS
 * Styled with national portal accents, neutral palette, tables, marquee banners, visitor counters, and stamps.
 * NO lorem ipsum - realistic government departments, policies, and acts.
 */

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  body { background: #f4f6f9; color: #212529; line-height: 1.6; }
  .top-strip { background: #003366; color: #ffffff; padding: 4px 24px; font-size: 12px; display: flex; justify-content: space-between; border-bottom: 2px solid #ff9933; }
  .header { background: #ffffff; padding: 18px 24px; border-bottom: 1px solid #dee2e6; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 4px rgba(0,0,0,0.04); }
  .emblem-title { display: flex; align-items: center; gap: 16px; }
  .emblem-badge { width: 50px; height: 50px; background: #e9ecef; border: 2px solid #003366; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #003366; font-size: 11px; text-align: center; }
  .dept-title h1 { font-size: 18px; color: #003366; font-weight: 700; }
  .dept-title p { font-size: 13px; color: #6c757d; }
  .nav { background: #002244; display: flex; padding: 0 24px; }
  .nav a { color: #f8f9fa; text-decoration: none; padding: 10px 16px; font-size: 13px; font-weight: 500; border-right: 1px solid rgba(255,255,255,0.1); }
  .nav a:hover { background: #004080; }
  .notice-banner { background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 8px 24px; font-size: 13px; display: flex; align-items: center; gap: 10px; }
  .notice-tag { background: #d39e00; color: #fff; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: bold; }
  .container { max-width: 1000px; margin: 24px auto; background: #ffffff; padding: 32px; border-radius: 4px; border: 1px solid #dee2e6; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  .scheme-heading { border-bottom: 2px solid #003366; padding-bottom: 8px; margin-bottom: 16px; color: #003366; font-size: 22px; }
  .scheme-intro { font-size: 14px; margin-bottom: 24px; color: #333333; }
  h2, h3 { color: #1a252f; margin-top: 24px; margin-bottom: 12px; font-size: 16px; border-left: 4px solid #ff9933; padding-left: 10px; }
  p, li { font-size: 14px; color: #333333; margin-bottom: 8px; }
  ul { padding-left: 20px; margin-bottom: 16px; }
  .table { width: 100%; border-collapse: collapse; margin: 16px 0 24px 0; font-size: 13px; }
  .table th, .table td { border: 1px solid #dee2e6; padding: 10px 14px; text-align: left; }
  .table th { background: #f1f4f8; color: #003366; font-weight: 600; }
  .footer { background: #1a252f; color: #ced4da; padding: 24px; font-size: 12px; margin-top: 40px; }
  .footer-inner { max-width: 1000px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
  .meta-stamp { font-size: 11px; color: #6c757d; margin-top: 16px; padding-top: 8px; border-top: 1px dashed #ced4da; }
`;

function renderFarmerScheme(version = 0) {
  // Version 0: Baseline
  // Version 1: Scenario A - Cosmetic changes only (banner, visitor counter, last updated, nav link, whitespace)
  // Version 2: Scenario B - Meaningful: benefit amount 6,000 -> 8,000
  // Version 3: Scenario C - Meaningful: deadline 31 March 2026 -> 30 June 2026

  let bannerText = "e-KYC verification mandatory for receiving next installment through Aadhaar-seeded accounts.";
  let visitorCount = "0142857";
  let lastUpdated = "10 January 2026";
  let navExtra = "";
  let benefitAmount = "Rs 6,000 per year";
  let benefitTableVal = "Rs 6,000 per year in 3 installments of Rs 2,000";
  let deadline = "31 March 2026";
  let familyIncome = "annual family income below Rs 2.5 lakh";

  if (version >= 1) {
    // Scenario A: cosmetic changes
    bannerText = "Scheduled portal maintenance on Sunday midnight. Farmers may submit e-KYC without interruption.";
    visitorCount = "0145290";
    lastUpdated = "18 January 2026";
    navExtra = `<a href="#kisan-call-centre">Kisan Helpline 1800-180-1551</a>`;
  }

  if (version >= 2) {
    // Scenario B: meaningful benefit amount
    benefitAmount = "Rs 8,000 per year";
    benefitTableVal = "Rs 8,000 per year in 4 installments of Rs 2,000";
  }

  if (version >= 3) {
    // Scenario C: meaningful deadline
    deadline = "30 June 2026";
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Pradhan Mantri Kisan Kalyan Yojana | Department of Agriculture</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <div class="top-strip">
    <span>Government of India | Ministry of Agriculture & Farmers Welfare</span>
    <span class="visitor-counter">Visitors: ${visitorCount}</span>
  </div>
  <header class="header">
    <div class="emblem-title">
      <div class="emblem-badge">GOI</div>
      <div class="dept-title">
        <h1>DEPARTMENT OF AGRICULTURE AND FARMERS WELFARE</h1>
        <p>Pradhan Mantri Kisan Kalyan & Income Support Mission</p>
      </div>
    </div>
  </header>
  <nav class="nav">
    <a href="#overview">Overview</a>
    <a href="#benefits">Scheme Benefits</a>
    <a href="#eligibility">Eligibility</a>
    <a href="#dates">Important Dates</a>
    ${navExtra}
  </nav>
  <div class="banner notice-banner">
    <span class="notice-tag">NOTICE</span>
    <marquee class="notice-ticker">${bannerText}</marquee>
  </div>
  <main class="container">
    <h1 class="scheme-heading">Pradhan Mantri Kisan Kalyan Yojana</h1>
    <p class="scheme-intro">Under the guidelines notified by the Government of India, the scheme provides income support to landholding farmer families across the country to enable them to take care of agricultural input requirements.</p>

    <h2>Financial Benefits</h2>
    <p>All eligible farmer beneficiaries will receive direct financial assistance of <strong>${benefitAmount}</strong> deposited directly into their Aadhaar linked bank accounts.</p>

    <table class="table">
      <thead>
        <tr><th>Assistance Category</th><th>Annual Entitlement</th><th>Disbursement Mode</th></tr>
      </thead>
      <tbody>
        <tr><td>Small & Marginal Farmers</td><td>${benefitTableVal}</td><td>Direct Benefit Transfer (DBT)</td></tr>
      </tbody>
    </table>

    <h2>Eligibility Criteria</h2>
    <p>Landholding farmer families with cultivated agricultural land in rural areas are entitled to support under this initiative:</p>
    <ul>
      <li>Applicant must possess valid land records verified by state revenue authorities.</li>
      <li>The family must have an <strong>${familyIncome}</strong> to qualify under category A.</li>
      <li>Institutional landholders and serving government officials are excluded.</li>
    </ul>

    <h2>Important Dates</h2>
    <p>Eligible farmers must submit verification and registration documents before the final closing date: <strong>${deadline}</strong>.</p>

    <div class="meta-stamp">
      <span class="last-updated">Last updated: ${lastUpdated}</span> | Designed by National Informatics Centre (NIC)
    </div>
  </main>
  <footer class="footer">
    <div class="footer-inner">
      <p>&copy; 2026 Department of Agriculture and Farmers Welfare, Govt of India.</p>
      <p>Hosted by NIC Portal Services</p>
    </div>
  </footer>
</body>
</html>`;
}

function renderWidowPensionScheme(version = 0) {
  // Version 0: Baseline (age 60, income 2.5 lakh, deadline 31 March 2026)
  // Version 1: Scenario C part 2: Deadline wording changes to "31/03/2026", but date is identical (MUST NOT alert!)
  // Version 2: Scenario D: Meaningful: annual family income below Rs 3 lakh, age 58 years

  let ageVal = "60 years";
  let incomeVal = "Rs 2.5 lakh";
  let deadlineText = "Applications must be submitted by 31 March 2026.";
  let visitorCount = "0084120";

  if (version >= 1) {
    // Scenario C2: wording changes, date identical
    deadlineText = "Online portal registration window closes on 31/03/2026 for all registered applicants.";
    visitorCount = "0084310";
  }

  if (version >= 2) {
    // Scenario D: meaningful income and age change
    ageVal = "58 years";
    incomeVal = "Rs 3 lakh";
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Indira Gandhi National Widow Pension Scheme | Social Welfare Department</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <div class="top-strip">
    <span>Department of Social Welfare | Government of India</span>
    <span class="visitor-counter">Visitors: ${visitorCount}</span>
  </div>
  <header class="header">
    <div class="emblem-title">
      <div class="emblem-badge">DSW</div>
      <div class="dept-title">
        <h1>NATIONAL SOCIAL ASSISTANCE PROGRAMME</h1>
        <p>Department of Social Justice and Empowerment</p>
      </div>
    </div>
  </header>
  <nav class="nav">
    <a href="#about">About Programme</a>
    <a href="#pension">Pension Amount</a>
    <a href="#eligibility">Eligibility</a>
    <a href="#deadlines">Deadlines</a>
  </nav>
  <main class="container">
    <h1 class="scheme-heading">Indira Gandhi National Widow Pension Scheme</h1>
    <p class="scheme-intro">This social security assistance scheme is implemented to ensure economic dignity for widows living below the poverty threshold.</p>

    <h2>Pension Amount</h2>
    <p>Under this programme, eligible beneficiaries receive a monthly assistance of <strong>Rs 1,000 per month</strong> credited via state treasury DBT.</p>

    <h2>Eligibility Criteria</h2>
    <p>To qualify for financial subvention under the state welfare rules:</p>
    <ul>
      <li>Applicants must have attained the minimum <strong>age of ${ageVal}</strong> or above.</li>
      <li>The applicant household must have an <strong>annual family income below ${incomeVal}</strong>.</li>
      <li>Applicant must not be in receipt of any other central or state government pension.</li>
    </ul>

    <h2>Important Dates</h2>
    <p>${deadlineText}</p>

    <div class="meta-stamp">
      <span class="last-updated">Last updated: 14 February 2026</span>
    </div>
  </main>
  <footer class="footer">
    <div class="footer-inner">
      <p>&copy; 2026 Social Welfare Department, Govt of India.</p>
    </div>
  </footer>
</body>
</html>`;
}

function renderScholarshipScheme(version = 0) {
  // Version 0: Baseline
  // Version 1: Scenario H - Ambiguous: eligibility paragraph rewritten substantially, facts unchanged (income 2.5 lakh, scholarship 25000, deadline 31 October 2026) -> text_changed

  let eligibilityParagraph = `Candidates must belong to notified target groups and must be enrolled full-time in accredited tertiary academic institutes. The annual family income below Rs 2.5 lakh is mandatory for sanction of funds. All verification dossiers must be endorsed by the educational institution head prior to state appraisal.`;

  if (version >= 1) {
    // Substantially rewritten text with different phrasing, dropped similarity (<0.85), but identical facts!
    eligibilityParagraph = `Subventions under this scholastic fund are strictly reserved for bona fide matriculated scholars pursuing collegiate certifications within authorized faculties. Qualifying applicants are obliged to confirm an annual family income below Rs 2.5 lakh by producing municipal revenue certifications countersigned by authorized administrative officers before departmental disbursement review.`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Post-Matric Merit Scholarship | Ministry of Minority Affairs</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <div class="top-strip">
    <span>Ministry of Minority Affairs | National Scholarship Portal</span>
    <span class="visitor-counter">Visitors: 0291480</span>
  </div>
  <header class="header">
    <div class="emblem-title">
      <div class="emblem-badge">NSP</div>
      <div class="dept-title">
        <h1>NATIONAL SCHOLARSHIP PORTAL</h1>
        <p>Post-Matric Merit-cum-Means Financial Assistance Scheme</p>
      </div>
    </div>
  </header>
  <nav class="nav">
    <a href="#benefits">Scholarship</a>
    <a href="#criteria">Eligibility Criteria</a>
    <a href="#deadlines">Timeline</a>
  </nav>
  <main class="container">
    <h1 class="scheme-heading">Post-Matric Merit-cum-Means Scholarship</h1>
    <p class="scheme-intro">Financial empowerment initiative for meritorious students from economically constrained sections.</p>

    <h2>Financial Assistance</h2>
    <p>Sanctioned candidates receive an academic stipend of <strong>Rs 25,000 per year</strong> covering annual tuition and academic maintenance allowances.</p>

    <h2>Eligibility Criteria</h2>
    <p>${eligibilityParagraph}</p>

    <h2>Important Dates</h2>
    <p>Online portal submissions for current academic cycle must be completed by <strong>31 October 2026</strong>.</p>

    <div class="meta-stamp">
      <span class="last-updated">Last updated: 05 March 2026</span>
    </div>
  </main>
  <footer class="footer">
    <div class="footer-inner">
      <p>&copy; 2026 National Scholarship Portal, Government of India.</p>
    </div>
  </footer>
</body>
</html>`;
}

function renderHousingScheme(version = 0) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Pradhan Mantri Gramin Awas Yojana | Ministry of Rural Development</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <div class="top-strip">
    <span>Ministry of Rural Development | Government of India</span>
    <span class="visitor-counter">Visitors: 0984210</span>
  </div>
  <header class="header">
    <div class="emblem-title">
      <div class="emblem-badge">PMAY</div>
      <div class="dept-title">
        <h1>PRADHAN MANTRI AWAS YOJANA (GRAMIN)</h1>
        <p>Rural Housing For All Mission</p>
      </div>
    </div>
  </header>
  <nav class="nav">
    <a href="#assistance">Unit Assistance</a>
    <a href="#criteria">Target Beneficiaries</a>
    <a href="#dates">Sanction Dates</a>
  </nav>
  <main class="container">
    <h1 class="scheme-heading">Pradhan Mantri Gramin Awas Yojana</h1>
    <p class="scheme-intro">A housing support scheme to provide pucca houses with basic amenities to all houseless households living in kutcha and dilapidated houses in rural areas.</p>

    <h2>Financial Assistance</h2>
    <p>Unit assistance provided is <strong>Rs 1,20,000</strong> in plain areas and Rs 1,30,000 in hilly or difficult areas for construction of dwelling units.</p>

    <h2>Eligibility Criteria</h2>
    <p>Beneficiaries are identified using housing deprivation parameters in the Socio-Economic and Caste Census (SECC). Households with an <strong>annual family income below Rs 2.5 lakh</strong> are given priority.</p>

    <h2>Important Dates</h2>
    <p>Phase-III village register verification deadline: <strong>31 December 2026</strong>.</p>

    <div class="meta-stamp">
      <span class="last-updated">Last updated: 20 February 2026</span>
    </div>
  </main>
  <footer class="footer">
    <div class="footer-inner">
      <p>&copy; 2026 Ministry of Rural Development, Govt of India.</p>
    </div>
  </footer>
</body>
</html>`;
}

module.exports = {
  renderFarmerScheme,
  renderWidowPensionScheme,
  renderScholarshipScheme,
  renderHousingScheme
};

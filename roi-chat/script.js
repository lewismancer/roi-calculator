/*
 * Interactive ROI calculator for WatchGuard MDR vs DIY SOC.
 * This script reads user inputs from a form, calculates the cost of building
 * and running an in‑house security operations center versus subscribing to
 * WatchGuard MDR services, and updates a results summary in real time.
 *
 * Cost and breach assumptions are derived from industry research:
 * - In‑house SOC costs roughly $440 per endpoint per year for a mid‑sized
 *   organization【693097963583846†L305-L314】. We adjust this by the entered analyst salary.
 * - MDR pricing is $15–25 per endpoint per month depending on the service level【823533540867509†L188-L210】.
 * - Breach costs vary by industry and country; companies using AI and automation
 *   save $1.76M and cut breach lifecycle by 108 days【693097963583846†L218-L223】.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Grab DOM elements
  const numEndpointsInput = document.getElementById('numEndpoints');
  const analystSalaryInput = document.getElementById('analystSalary');
  const numAlertsInput = document.getElementById('numAlerts');
  const triagePercentInput = document.getElementById('triagePercent');
  const triageValueSpan = document.getElementById('triageValue');
  const riskToleranceInput = document.getElementById('riskTolerance');
  const riskValueSpan = document.getElementById('riskValue');
  const serviceLevelSelect = document.getElementById('serviceLevel');
  const productCheckboxes = document.querySelectorAll('.product-checkbox');
  const industrySelect = document.getElementById('industry');
  const countrySelect = document.getElementById('country');
  const resultsSummary = document.getElementById('resultsSummary');
  const downloadButton = document.getElementById('downloadReport');
  // Storage for the most recent calculation results to be used when generating the PDF
  let lastResults = null;

  // Partner settings elements
  const partnerToggle = document.getElementById('partnerToggle');
  const partnerPasswordSection = document.getElementById('partnerPasswordSection');
  const partnerPasswordInput = document.getElementById('partnerPassword');
  const partnerUnlockBtn = document.getElementById('partnerUnlockBtn');
  const partnerContent = document.getElementById('partnerContent');
  const partnerMonitoringPrice = document.getElementById('partnerMonitoringPrice');
  const partnerThreatPrice = document.getElementById('partnerThreatPrice');
  const partnerFullPrice = document.getElementById('partnerFullPrice');

  // Flag to indicate whether partner pricing has been unlocked
  let partnerUnlocked = false;
  // Object to hold custom service prices (per endpoint per month)
  const customServiceCost = {
    'Monitoring': null,
    'Threat Hunting and Response': null,
    'Full Incident Response': null
  };



  // Advanced settings elements
  const advancedToggle = document.getElementById('advancedToggle');
  const advancedContent = document.getElementById('advancedContent');
  const numServersInput = document.getElementById('numServers');
  const burdenRateInput = document.getElementById('burdenRate');
  const burdenValueSpan = document.getElementById('burdenValue');
  const techCheckboxes = document.querySelectorAll('.tech-checkbox');
  const complianceCheckbox = document.getElementById('compliance');

  // Constants
  const INHOUSE_COST_PER_ENDPOINT_YEAR = 440;
  const BASE_ANALYST_SALARY = 120000;
  const serviceCost = {
    'Monitoring': 15 * 12,
    'Threat Hunting and Response': 20 * 12,
    'Full Incident Response': 25 * 12
  };

  // Additional cost assumptions for advanced settings
  const SERVER_COST_PER_YEAR = 100 * 12; // $100/server/month
  const TECH_COSTS = {
    siem: 2000 * 12,          // $2k/month for SIEM
    edr: 1000 * 12,           // $1k/month for EDR
    threatIntel: 1000 * 12    // $1k/month for threat intelligence
  };
  const industryCosts = {
    'Healthcare': 10.93,
    'Financial': 5.9,
    'Pharmaceuticals': 4.82,
    'Energy': 4.78,
    'Industrial': 4.73,
    'Critical Infrastructure': 5.04,
    'Other': 4.88
  };
  const countryCosts = {
    'USA': 9.48,
    'Middle East': 8.07,
    'Canada': 5.13,
    'Germany': 4.67,
    'Japan': 4.52,
    'Other': 4.88
  };
  const riskFactors = {
    'Healthcare': 0.4,
    'Financial': 0.35,
    'Pharmaceuticals': 0.35,
    'Energy': 0.35,
    'Industrial': 0.3,
    'Critical Infrastructure': 0.4,
    'Other': 0.25
  };

  // Event listeners to update results in real time
  [numEndpointsInput, analystSalaryInput, numAlertsInput, triagePercentInput, riskToleranceInput,
   serviceLevelSelect, industrySelect, countrySelect].forEach(el => {
    el.addEventListener('input', calculate);
  });
  productCheckboxes.forEach(cb => cb.addEventListener('change', calculate));

  // Advanced settings events
  [numServersInput, burdenRateInput].forEach(el => el.addEventListener('input', calculate));
  techCheckboxes.forEach(cb => cb.addEventListener('change', calculate));
  if (complianceCheckbox) complianceCheckbox.addEventListener('change', calculate);
  triagePercentInput.addEventListener('input', () => {
    triageValueSpan.textContent = `${triagePercentInput.value}%`;
    calculate();
  });
  riskToleranceInput.addEventListener('input', () => {
    riskValueSpan.textContent = `${riskToleranceInput.value}`;
    calculate();
  });

  // Update burden rate display
  burdenRateInput.addEventListener('input', () => {
    burdenValueSpan.textContent = `${burdenRateInput.value}%`;
    calculate();
  });

  // Toggle advanced settings visibility
  advancedToggle.addEventListener('click', () => {
    const isHidden = advancedContent.style.display === 'none';
    advancedContent.style.display = isHidden ? 'block' : 'none';
    advancedToggle.textContent = isHidden ? 'Advanced settings ▲' : 'Advanced settings ▼';
  });

  // Override the download button: show lead capture modal instead of immediately downloading
  downloadButton.addEventListener('click', () => {
    if (!lastResults) {
      alert('Please complete the input fields first.');
      return;
    }
    showLeadModal();
  });

  /**
   * Partner settings toggle handler. Shows/hides the password entry or partner
   * pricing form depending on whether the partner has been unlocked. The toggle
   * text changes to reflect the current state.
   */
  partnerToggle.addEventListener('click', () => {
    const isHidden = (partnerUnlocked
      ? partnerContent.style.display === 'none'
      : partnerPasswordSection.style.display === 'none');
    if (partnerUnlocked) {
      // Toggle partner pricing form
      partnerContent.style.display = isHidden ? 'block' : 'none';
      // When showing the pricing form, scroll it into view so the user can see it
      if (isHidden) {
        partnerContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      // Toggle password entry section
      partnerPasswordSection.style.display = isHidden ? 'block' : 'none';
      if (isHidden) {
        partnerPasswordSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
    partnerToggle.textContent = isHidden ? 'Partner settings ▲' : 'Partner settings ▼';
  });

  /**
   * Handles partner unlock. If the entered password matches 12345, unlock
   * partner pricing and reveal the pricing inputs. Otherwise, alert the user.
   */
  partnerUnlockBtn.addEventListener('click', () => {
    const pwd = partnerPasswordInput.value.trim();
    if (pwd === '12345') {
      partnerUnlocked = true;
      partnerPasswordSection.style.display = 'none';
      partnerContent.style.display = 'block';
      partnerToggle.textContent = 'Partner settings ▲';
      // Recalculate costs with partner pricing (even if custom prices not yet changed)
      calculate();
    } else {
      alert('Incorrect password. Please try again.');
    }
  });

  /**
   * Updates custom service pricing when a partner price input changes. Prices are
   * stored per endpoint per month. After updating, recalculates costs.
   */
  function updateCustomPrices() {
    customServiceCost['Monitoring'] = parseFloat(partnerMonitoringPrice.value) || null;
    customServiceCost['Threat Hunting and Response'] = parseFloat(partnerThreatPrice.value) || null;
    customServiceCost['Full Incident Response'] = parseFloat(partnerFullPrice.value) || null;
    calculate();
  }
  if (partnerMonitoringPrice) partnerMonitoringPrice.addEventListener('input', updateCustomPrices);
  if (partnerThreatPrice) partnerThreatPrice.addEventListener('input', updateCustomPrices);
  if (partnerFullPrice) partnerFullPrice.addEventListener('input', updateCustomPrices);

  // Format numbers as currency
  function formatCurrency(num) {
    return `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }

  // Calculate costs and update the results panel
  function calculate() {
    const numEndpoints = parseInt(numEndpointsInput.value, 10) || 0;
    const numServers = parseInt(numServersInput.value, 10) || 0;
    const analystSalary = parseFloat(analystSalaryInput.value) || BASE_ANALYST_SALARY;
    const numAlerts = parseInt(numAlertsInput.value, 10) || 0;
    const triagePercent = parseFloat(triagePercentInput.value) || 0;
    const riskTolerance = parseFloat(riskToleranceInput.value) || 0;
    const serviceLevel = serviceLevelSelect.value;
    const selectedProducts = Array.from(productCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);
    const industry = industrySelect.value;
    const country = countrySelect.value;

    // Advanced inputs
    const burdenRate = parseFloat(burdenRateInput.value) || 0;
    const selectedTechs = Array.from(techCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
    const compliance = complianceCheckbox && complianceCheckbox.checked;

    // Adjust in‑house cost per endpoint based on analyst salary
    const adjustedSalary = analystSalary * (1 + burdenRate / 100);
    const adjustedCostPerEndpoint = INHOUSE_COST_PER_ENDPOINT_YEAR * (adjustedSalary / BASE_ANALYST_SALARY);
    // Total endpoints include servers as part of infrastructure
    const totalEndpoints = numEndpoints + numServers;
    let inhouseCost = totalEndpoints * adjustedCostPerEndpoint;
    // Add separate server costs if specified (servers often incur higher cost)
    inhouseCost += numServers * SERVER_COST_PER_YEAR;

    // Determine service cost schedule. If partner pricing is unlocked and all
    // custom prices are provided, use them; otherwise fall back to defaults.
    let currentServiceCost = serviceCost;
    if (partnerUnlocked && customServiceCost['Monitoring'] != null && customServiceCost['Threat Hunting and Response'] != null && customServiceCost['Full Incident Response'] != null) {
      currentServiceCost = {
        'Monitoring': customServiceCost['Monitoring'] * 12,
        'Threat Hunting and Response': customServiceCost['Threat Hunting and Response'] * 12,
        'Full Incident Response': customServiceCost['Full Incident Response'] * 12
      };
    }
    // MDR cost per endpoint (annual)
    let mdrCost = totalEndpoints * (currentServiceCost[serviceLevel] || currentServiceCost['Threat Hunting and Response']);
    // Apply discount for existing products: 10% for one product, 15% for two or more
    let discount = 0;
    if (selectedProducts.length >= 2) discount = 0.15;
    else if (selectedProducts.length === 1) discount = 0.10;
    mdrCost = mdrCost * (1 - discount);

    // Add technology stack costs if selected in advanced settings
    let techCost = 0;
    selectedTechs.forEach(key => {
      techCost += TECH_COSTS[key] || 0;
    });
    mdrCost += techCost;

    // Determine base breach cost (millions) from industry and country
    const baseCost = Math.max(
      industryCosts[industry] || industryCosts['Other'],
      countryCosts[country] || industryCosts[industry] || industryCosts['Other']
    );
    // Adjust risk based on industry and risk tolerance (0–100)
    const baseRisk = riskFactors[industry] || riskFactors['Other'];
    const riskAdjustment = (100 - riskTolerance) / 100; // lower tolerance = higher adjustment
    const risk = baseRisk * riskAdjustment;

    // Increase breach cost for strict compliance environments
    const complianceMultiplier = compliance ? 1.2 : 1.0;

    // Expected breach costs
    const expectedBreachInhouse = baseCost * complianceMultiplier * risk * 1_000_000;
    const reducedRisk = Math.max(risk * (1 - 0.3), 0);
    let expectedBreachMDR = (baseCost * complianceMultiplier * reducedRisk - 1.76) * 1_000_000;
    if (expectedBreachMDR < 0) expectedBreachMDR = 0;

    // Alerts triaged and freed capacity
    const alertsTriaged = numAlerts * (triagePercent / 100);
    const freedHours = alertsTriaged * 0.1; // assume 6 minutes (0.1 hr) per alert triaged manually
    const freedFTEs = freedHours / 2080;

    const totalInhouse = inhouseCost + expectedBreachInhouse;
    const totalMDR = mdrCost + expectedBreachMDR;
    const savings = totalInhouse - totalMDR;
    const roi = totalMDR > 0 ? (savings / totalMDR) * 100 : 0;

    // Save results for PDF generation
    lastResults = {
      totalInhouse,
      totalMDR,
      savings,
      roi,
      freedFTEs,
      expectedBreachInhouse,
      expectedBreachMDR,
      inhouseCost,
      mdrCost,
      risk,
      baseCost,
      numEndpoints,
      numServers,
      analystSalary,
      numAlerts,
      triagePercent,
      riskTolerance,
      serviceLevel,
      selectedProducts,
      industry,
      country,
      burdenRate,
      selectedTechs,
      compliance
    };

    // Build results summary HTML
    let html = '';
    // Build result rows with stylised labels and values
    html += `<div class="result-row"><span class="result-label">Build your own SOC</span><span class="result-value value-build">${formatCurrency(totalInhouse)}</span></div>`;
    html += `<div class="result-row"><span class="result-label">WatchGuard MDR</span><span class="result-value value-mdr">${formatCurrency(totalMDR)}</span></div>`;
    html += `<div class="result-row"><span class="result-label">Annual savings</span><span class="result-value value-savings-box">${formatCurrency(savings)}</span></div>`;
    html += `<div class="result-row"><span class="result-label">ROI</span><span class="result-value value-roi">${roi.toFixed(1)}%</span></div>`;
    html += `<div class="result-row"><span class="result-label">Freed SOC capacity</span><span class="result-value">${freedFTEs.toFixed(1)} FTEs</span></div>`;
    html += `<div class="result-row"><span class="result-label">Reduced exposure time</span><span class="result-value">108 days</span></div>`;
    // Add explanatory notes and assumptions similar to WatchGuard's own calculator
    html += `<p style="font-size: 12px; color: var(--wg-gray); margin-top: 8px;">Savings estimate includes reduction in breach lifecycle of 108 days and $1.76M in breach cost avoided thanks to AI and automation.</p>`;
    html += `<p style="font-size: 12px; color: var(--wg-gray); margin-top: 4px;"><em>*Build your own SOC cost assumes five full‑time analysts, automation, threat intelligence and SIEM/EDR licensing costs.*</em></p>`;
    html += `<p style="font-size: 12px; color: var(--wg-gray); margin-top: 2px;"><em>*MDR pricing is estimated at $15–25 per endpoint per month depending on service level and may vary; SOC cost is based on building an advanced SOC in‑house.*</em></p>`;
    resultsSummary.innerHTML = html;
    // Update charts with the new results
    updateCharts(lastResults);
  }

  // Initial calculation
  calculate();


  // Lead capture modal elements
  const leadModal = document.getElementById('leadModal');
  const leadForm = document.getElementById('leadForm');
  const cancelLeadBtn = document.getElementById('cancelLead');

  /**
   * Displays the lead capture modal.
   */
  function showLeadModal() {
    leadModal.style.display = 'block';
  }
  /**
   * Hides the lead capture modal.
   */
  function hideLeadModal() {
    leadModal.style.display = 'none';
  }

  // Cancel button closes the modal without generating a report
  cancelLeadBtn.addEventListener('click', (e) => {
    e.preventDefault();
    hideLeadModal();
  });
  // Clicking anywhere outside the modal content closes it
  leadModal.addEventListener('click', (e) => {
    if (e.target === leadModal) {
      hideLeadModal();
    }
  });

  // Handle lead form submission
  leadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    // Collect lead details
    const leadData = {
      firstName: document.getElementById('firstName').value.trim(),
      lastName: document.getElementById('lastName').value.trim(),
      company: document.getElementById('companyName').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim()
    };
    // TODO: Integrate with Marketo forms here. For demonstration, we simply log the details.
    console.log('Lead captured:', leadData);
    // Generate and download the PDF
    const inputs = collectInputs();
    generatePDFReport(inputs, lastResults);
    // Hide modal and reset form
    hideLeadModal();
    leadForm.reset();
    alert('Thank you! Your report is downloading.');
  });
  /**
   * Collects current input values into an object for use in the PDF report.
   */
  function collectInputs() {
    const products = Array.from(productCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);
    const techs = Array.from(techCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);
    return {
      endpoints: parseInt(numEndpointsInput.value, 10) || 0,
      servers: parseInt(numServersInput.value, 10) || 0,
      analystSalary: parseFloat(analystSalaryInput.value) || BASE_ANALYST_SALARY,
      burdenRate: parseFloat(burdenRateInput.value) || 0,
      alerts: parseInt(numAlertsInput.value, 10) || 0,
      triagePercent: parseFloat(triagePercentInput.value) || 0,
      riskTolerance: parseFloat(riskToleranceInput.value) || 0,
      serviceLevel: serviceLevelSelect.value,
      products,
      industry: industrySelect.value,
      country: countrySelect.value,
      techs,
      compliance: complianceCheckbox && complianceCheckbox.checked
    };
  }

  /**
   * Updates the simple bar charts displayed in the results panel. This function
   * replaces the previous Chart.js implementation with CSS‑based bars to
   * visualise cost comparisons and freed SOC capacity. It is called each time
   * the calculation runs and ensures the chart container is visible.
   *
   * @param {Object} results - The latest calculation results.
   */
  function updateCharts(results) {
    const chartContainer = document.getElementById('chartContainer');
    // Show the chart container when results are available
    chartContainer.style.display = 'block';

    // Grab bar elements
    const barInhouseFill = document.getElementById('barInhouseFill');
    const barMDRFill = document.getElementById('barMDRFill');
    const barFreedFill = document.getElementById('barFreedFill');
    const barInhouseValue = document.getElementById('barInhouseValue');
    const barMDRValue = document.getElementById('barMDRValue');
    const barFreedValue = document.getElementById('barFreedValue');

    // Determine maximum cost to normalise bar widths
    const maxCost = Math.max(results.totalInhouse, results.totalMDR);
    const inhousePercent = maxCost > 0 ? (results.totalInhouse / maxCost) * 100 : 0;
    const mdrPercent = maxCost > 0 ? (results.totalMDR / maxCost) * 100 : 0;
    // Freed FTEs: normalise based on 10 FTEs. Use 10 as a reasonable upper bound for visualisation.
    const freedMax = 10;
    const freedPercent = Math.min(results.freedFTEs / freedMax, 1) * 100;

    // Set bar widths and colours
    barInhouseFill.style.width = inhousePercent + '%';
    barInhouseFill.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--wg-red');
    barMDRFill.style.width = mdrPercent + '%';
    barMDRFill.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--wg-dark-blue');
    barFreedFill.style.width = freedPercent + '%';
    barFreedFill.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--wg-red');

    // Set value labels
    barInhouseValue.textContent = formatCurrency(results.totalInhouse);
    barMDRValue.textContent = formatCurrency(results.totalMDR);
    barFreedValue.textContent = results.freedFTEs.toFixed(1) + ' FTEs';
  }

  /**
   * Generates a one‑page PDF report summarizing the inputs and results. Utilizes jsPDF via the UMD bundle.
   * @param {Object} inputs
   * @param {Object} results
   */
  function generatePDFReport(inputs, results) {
    // Ensure jsPDF is available
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('PDF library not loaded.');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    // Margins and coordinates
    let y = 40;
    const leftMargin = 40;

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('WatchGuard MDR ROI Report', leftMargin, y);
    y += 26;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, leftMargin, y);
    y += 24;

    // Inputs summary
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Your Inputs', leftMargin, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const wrapOptions = { maxWidth: 520 };
    const inputLines = [];
    inputLines.push(`Endpoints: ${inputs.endpoints}`);
    if (inputs.servers > 0) inputLines.push(`Servers: ${inputs.servers}`);
    inputLines.push(`Analyst salary: $${inputs.analystSalary.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
    if (inputs.burdenRate > 0) inputLines.push(`Employee burden rate: ${inputs.burdenRate}%`);
    inputLines.push(`Annual alerts: ${inputs.alerts.toLocaleString()}`);
    inputLines.push(`Alert triage today: ${inputs.triagePercent}%`);
    inputLines.push(`Risk tolerance: ${inputs.riskTolerance}`);
    inputLines.push(`Service level: ${inputs.serviceLevel}`);
    if (inputs.products.length > 0) inputLines.push(`Existing products: ${inputs.products.join(', ')}`);
    else inputLines.push('Existing products: None');
    inputLines.push(`Industry: ${inputs.industry}`);
    inputLines.push(`Country: ${inputs.country}`);
    if (inputs.techs.length > 0) inputLines.push(`Tech stack needed: ${inputs.techs.map(key => key.toUpperCase()).join(', ')}`);
    if (inputs.compliance) inputLines.push('Strict regulatory compliance: Yes');
    else if (inputs.techs.length > 0 || inputs.servers > 0 || inputs.burdenRate > 0) inputLines.push('Strict regulatory compliance: No');
    // Print lines with automatic wrapping
    inputLines.forEach(line => {
      const lines = doc.splitTextToSize(line, 520);
      lines.forEach(l => {
        doc.text(l, leftMargin, y);
        y += 14;
      });
    });
    y += 6;

    // Results summary
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Results Summary', leftMargin, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const resultsLines = [];
    resultsLines.push(`Total cost to build your own SOC: $${results.totalInhouse.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
    resultsLines.push(`Total cost with WatchGuard MDR: $${results.totalMDR.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
    resultsLines.push(`Annual savings: $${results.savings.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
    resultsLines.push(`ROI: ${results.roi.toFixed(1)}%`);
    resultsLines.push(`Freed SOC capacity: ${results.freedFTEs.toFixed(1)} FTEs`);
    resultsLines.push(`Reduced exposure time: 108 days`);
    resultsLines.forEach(line => {
      const lines = doc.splitTextToSize(line, 520);
      lines.forEach(l => {
        doc.text(l, leftMargin, y);
        y += 14;
      });
    });
    y += 8;

    // Explanation / methodology
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Methodology & Assumptions', leftMargin, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const explanation = [
      'In‑house SOC cost is estimated at $440 per endpoint per year for mid‑sized organizations and scaled by your analyst salary and overhead. Server infrastructure adds additional recurring costs.',
      'MDR cost is based on the selected service level ($15–25 per endpoint per month) with discounts for existing WatchGuard products and add‑on pricing for SIEM/EDR/Threat Intelligence if selected.',
      'Expected breach costs are derived from industry and country averages and adjusted by your risk tolerance. MDR reduces breach risk by 30% and leverages AI and automation to save $1.76M and shorten breach lifecycle by 108 days.',
      'Savings and ROI are calculated by comparing total in‑house costs (operational + expected breach costs) against total MDR costs (subscription + expected breach costs). Freed capacity is estimated from the reduction in alerts you triage.'
    ];
    explanation.forEach(paragraph => {
      const lines = doc.splitTextToSize(paragraph, 520);
      lines.forEach(l => {
        doc.text(l, leftMargin, y);
        y += 12;
      });
      y += 4;
    });

    // Footnotes for citations
    y = 750; // position footnotes near bottom of letter page (letter height ~ 792pt)
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.text('[1] IT Convergence: Estimated total cost of in‑house SOC and MDR comparison【693097963583846†L305-L314】.', leftMargin, y);
    y += 10;
    doc.text('[2] Research: AI & automation saves $1.76M and 108 days【693097963583846†L218-L223】.', leftMargin, y);
    y += 10;
    doc.text('[3] UpGuard: Average breach costs vary by industry【753488506210633†screenshot】.', leftMargin, y);
    y += 10;
    doc.text('[4] MDR pricing factors include endpoints, servers and technology stacks【553411471883090†L203-L231】.', leftMargin, y);

    // Download the PDF
    doc.save('WatchGuard_MDR_ROI_Report.pdf');
  }
});
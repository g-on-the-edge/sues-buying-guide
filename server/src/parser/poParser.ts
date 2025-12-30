import { PurchaseOrder, SpecialOrder, POStats, CurrentVendor } from '../types';

const URGENT_WINDOW_DAYS = 5; // POs due within 5 days need attention

/**
 * Parse date from MM/DD/YY format
 */
function parseDate(dateStr: string): Date | null {
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;

  const [, month, day, year] = match;
  // Assume 20XX for two-digit years
  const fullYear = parseInt(year, 10) + 2000;
  return new Date(fullYear, parseInt(month, 10) - 1, parseInt(day, 10));
}

/**
 * Extract report date from PDF text
 * Looks for "RUN DATE: MM/DD/YY" pattern
 */
export function extractReportDate(text: string): Date | null {
  const match = text.match(/RUN DATE:\s*(\d{2}\/\d{2}\/\d{2})/i);
  if (!match) return null;
  return parseDate(match[1]);
}

/**
 * Calculate days until due date from report date
 */
function calculateDaysUntilDue(dueDate: string, reportDate: Date): number {
  const due = parseDate(dueDate);
  if (!due) return 0;

  const diffTime = due.getTime() - reportDate.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate PO urgency based on due date and confirmation status
 */
function calculatePOUrgency(
  po: PurchaseOrder,
  reportDate: Date
): { isUrgent: boolean; urgentReasons: string[]; daysUntilDue: number } {
  const daysUntilDue = calculateDaysUntilDue(po.dueDate, reportDate);
  const urgentReasons: string[] = [];
  let isUrgent = false;

  // Only check POs due within the urgent window (or overdue)
  if (daysUntilDue <= URGENT_WINDOW_DAYS) {
    // Check 1: No EDI confirmation
    if (!po.edi) {
      urgentReasons.push('No EDI confirmation');
      isUrgent = true;
    }

    // Check 2: No appointment scheduled
    if (!po.appointment) {
      urgentReasons.push('No appointment');
      isUrgent = true;
    }
  }

  return { isUrgent, urgentReasons, daysUntilDue };
}

/**
 * Check if a line is a PO header
 * Various formats:
 * - "Open P.O. Summary for Vendor 00001740"
 * - "Open P.O. Summary for Vendor"
 * - Lines containing "P.O." followed by "Due" (column header)
 */
export function isPOHeader(line: string): boolean {
  // Check for explicit PO summary header
  if (/Open P\.?O\.? Summary/i.test(line)) return true;
  // Check for PO column header pattern
  if (/P\.?O\.?\s+Due\s+Total/i.test(line)) return true;
  return false;
}

/**
 * Check if a line is a Special Order header
 * Example: "Special Order summary for this vendor"
 */
export function isSpecialOrderHeader(line: string): boolean {
  return /Special Order summary for this vendor/i.test(line);
}

/**
 * Check if a line is a PO column header
 * Example: "P.O.    Due    Total  Status"
 */
function isPOColumnHeader(line: string): boolean {
  return /^P\.O\.\s+Due/i.test(line.trim());
}

/**
 * Check if line starts with a 5-digit PO number
 */
function startsWithPONumber(line: string): boolean {
  return /^\d{5}\s/.test(line.trim());
}

/**
 * Parse a PO line
 * Example: "60649 01/02/26 955 Conf:EDI Costs Yes 01/02/26 06:00 12/23/25"
 * Example: "60650 01/03/26 1200 Conf:Recpt/Qty/Costs. 01/03/26 08:30 12/24/25"
 */
export function parsePOLine(
  line: string,
  vendor: CurrentVendor,
  reportDate: Date
): PurchaseOrder | null {
  const trimmed = line.trim();
  const tokens = trimmed.split(/\s+/);

  // Must have at least 4 tokens: PO#, due date, cases, status
  if (tokens.length < 4) return null;

  // First token must be 5-digit PO number
  const poNumber = tokens[0];
  if (!/^\d{5}$/.test(poNumber)) return null;

  // Second token should be due date (MM/DD/YY)
  const dueDate = tokens[1];
  if (!/^\d{2}\/\d{2}\/\d{2}$/.test(dueDate)) return null;

  // Third token should be cases (integer)
  const casesStr = tokens[2];
  if (!/^\d+$/.test(casesStr)) return null;
  const totalCases = parseInt(casesStr, 10);

  // Rest of the line contains status and other info
  const restOfLine = tokens.slice(3).join(' ');

  // Extract status (starts with Conf: or similar)
  let status = '';
  const statusMatch = restOfLine.match(/^(Conf:[^\s]+|Pending|Received)/);
  if (statusMatch) {
    status = statusMatch[1];
  } else {
    // Take first token as status
    status = tokens[3] || '';
  }

  // Check for EDI confirmation (look for "Yes" or "No" after status)
  let edi: boolean | null = null;
  if (/\bYes\b/i.test(restOfLine)) {
    edi = true;
  } else if (/\bNo\b/i.test(restOfLine)) {
    edi = false;
  }
  // Also check if status contains "EDI"
  if (status.toLowerCase().includes('edi')) {
    edi = true;
  }

  // Extract dates from rest of line (MM/DD/YY format)
  const dates = restOfLine.match(/\d{2}\/\d{2}\/\d{2}/g) || [];

  // Extract times (HH:MM format)
  const times = restOfLine.match(/\d{2}:\d{2}/g) || [];

  // Appointment is typically the first date+time combo after status
  let appointment: string | null = null;
  if (dates.length > 0 && times.length > 0) {
    appointment = `${dates[0]} ${times[0]}`;
  }

  // Pick up info (if present)
  let pickUp: string | null = null;
  if (restOfLine.toLowerCase().includes('pickup') || restOfLine.toLowerCase().includes('pick up')) {
    pickUp = 'Yes';
  }

  // Entered date is typically the last date
  let entered: string | null = null;
  if (dates.length > 0) {
    entered = dates[dates.length - 1];
  }

  // Create base PO object
  const po: PurchaseOrder = {
    poNumber,
    vendorId: vendor.id,
    vendorName: vendor.name,
    dueDate,
    totalCases,
    status,
    edi,
    appointment,
    pickUp,
    entered,
    daysUntilDue: 0,
    isUrgent: false,
    urgentReasons: [],
  };

  // Calculate urgency
  const urgency = calculatePOUrgency(po, reportDate);
  po.daysUntilDue = urgency.daysUntilDue;
  po.isUrgent = urgency.isUrgent;
  po.urgentReasons = urgency.urgentReasons;

  return po;
}

/**
 * Parse a Special Order line
 * Example: "TF164 CHIP POTATO JALAPENO 1415 BILL & CAROL'S 12/11/25 12/22/25 01/06/26 60468 1 0 *DOQ* Bill H"
 */
export function parseSpecialOrderLine(
  line: string,
  vendor: CurrentVendor
): SpecialOrder | null {
  const trimmed = line.trim();
  const tokens = trimmed.split(/\s+/);

  // Must have a valid product number as first token
  if (tokens.length < 6) return null;
  if (!/^[A-Z0-9]{2,8}$/i.test(tokens[0])) return null;

  const prodNo = tokens[0];

  // Extract dates (MM/DD/YY format)
  const dates: string[] = trimmed.match(/\d{2}\/\d{2}\/\d{2}/g) || [];
  if (dates.length === 0) return null;

  // Extract 5-digit PO number
  const poMatch = trimmed.match(/\b(\d{5})\b/);
  const poNumber = poMatch ? poMatch[1] : null;

  // Determine status
  let status: 'Ready' | '*DOQ*' | 'Order' = 'Order';
  if (trimmed.includes('*DOQ*')) {
    status = '*DOQ*';
  } else if (/\bReady\b/i.test(trimmed)) {
    status = 'Ready';
  }

  // Try to extract description (tokens between prodNo and first date or customer info)
  // This is tricky - we'll take tokens until we hit a date pattern or number
  const descTokens: string[] = [];
  let custName = '';
  let custNo = '';

  // Find where description ends (usually before customer number or dates)
  let descEnd = 1;
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    // Stop at date pattern
    if (/^\d{2}\/\d{2}\/\d{2}$/.test(token)) break;
    // Stop at customer number (4-digit number often)
    if (/^\d{4}$/.test(token) && i > 2) {
      custNo = token;
      // Customer name might be next tokens
      for (let j = i + 1; j < tokens.length; j++) {
        if (/^\d{2}\/\d{2}\/\d{2}$/.test(tokens[j])) break;
        custName += (custName ? ' ' : '') + tokens[j];
      }
      break;
    }
    descTokens.push(token);
    descEnd = i + 1;
  }

  const description = descTokens.join(' ');

  // Extract quantities - look for numbers near the end before status
  // Pattern typically: ... qty onHand status
  let qtyOrdered = 0;
  let onHand = 0;

  // Find integers near the end (before status)
  const intMatches: string[] = trimmed.match(/\b(\d{1,4})\b/g) || [];
  // Filter out dates and PO numbers
  const quantities = intMatches.filter(
    (n: string) => !dates.includes(n) && n !== poNumber && n.length <= 3
  );

  if (quantities.length >= 2) {
    qtyOrdered = parseInt(quantities[quantities.length - 2], 10);
    onHand = parseInt(quantities[quantities.length - 1], 10);
  } else if (quantities.length === 1) {
    qtyOrdered = parseInt(quantities[0], 10);
  }

  return {
    prodNo,
    description,
    custNo,
    customerName: custName,
    dateEntered: dates[0] || '',
    dateDoq: dates.length > 1 ? dates[1] : null,
    dateDue: dates.length > 2 ? dates[2] : null,
    poNumber,
    qtyOrdered,
    onHand,
    status,
    vendorId: vendor.id,
    vendorName: vendor.name,
  };
}

/**
 * Check if a line looks like a PO data line
 * Pattern: 5-digit number, then date (MM/DD/YY), then a number (cases)
 * Example: "60649 01/02/26 955 Conf:EDI Costs..."
 */
function isPODataLine(line: string): boolean {
  const trimmed = line.trim();
  // Must start with 5-digit PO number
  if (!/^\d{5}\s/.test(trimmed)) return false;

  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 4) return false;

  // Second token should be a date (MM/DD/YY)
  if (!/^\d{2}\/\d{2}\/\d{2}$/.test(tokens[1])) return false;

  // Third token should be a number (cases)
  if (!/^\d+$/.test(tokens[2])) return false;

  // Fourth token usually starts with "Conf:" or similar status
  // This helps distinguish PO lines from other 5-digit numbered items
  const rest = tokens.slice(3).join(' ');
  if (/^Conf:/i.test(rest) || /\bYes\b|\bNo\b/i.test(rest)) {
    return true;
  }

  // Also check if line contains typical PO elements (dates and times)
  const dateMatches = trimmed.match(/\d{2}\/\d{2}\/\d{2}/g);
  const timeMatches = trimmed.match(/\d{2}:\d{2}/g);

  // PO lines typically have multiple dates
  if (dateMatches && dateMatches.length >= 2) return true;

  // Or a date+time combo (appointment)
  if (timeMatches && timeMatches.length > 0) return true;

  return false;
}

/**
 * Parse all POs and Special Orders from extracted PDF text
 *
 * Strategy: Scan ALL lines for PO patterns, not just lines in a "PO section"
 * PO lines are identified by their format: 5-digit PO#, date, cases, status
 */
export function parseAllPOs(
  text: string,
  reportDate: Date
): { purchaseOrders: PurchaseOrder[]; specialOrders: SpecialOrder[]; errors: string[] } {
  const lines = text.split('\n');
  const purchaseOrders: PurchaseOrder[] = [];
  const specialOrders: SpecialOrder[] = [];
  const errors: string[] = [];
  const seenPONumbers = new Set<string>(); // Avoid duplicates

  // Debug: Log text sample to see what we're working with
  console.log('[PO Parser] Total lines:', lines.length);
  console.log('[PO Parser] Scanning for PO lines...');

  // DEBUG: Log any line that starts with 5 digits to see what we're missing
  const potentialPOLines = lines.filter(l => /^\s*\d{5}\s/.test(l));
  console.log('[PO Parser] Lines starting with 5-digit number:', potentialPOLines.length);
  if (potentialPOLines.length > 0 && potentialPOLines.length <= 10) {
    potentialPOLines.forEach((l, i) => {
      console.log(`[PO Parser] Sample line ${i + 1}:`, l.trim().substring(0, 100));
    });
  } else if (potentialPOLines.length > 10) {
    potentialPOLines.slice(0, 5).forEach((l, i) => {
      console.log(`[PO Parser] Sample line ${i + 1}:`, l.trim().substring(0, 100));
    });
  }

  let currentVendor: CurrentVendor | null = null;
  let inSpecialOrderSection = false;
  let poLinesFound = 0;

  // Pattern to detect vendor lines
  const vendorPattern = /^Vendor:\s*(\d+)\s+(.+?)(?:\s*\*?\s*Broker:|$)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    try {
      // Check for vendor line - always update current vendor
      const vendorMatch = line.match(vendorPattern);
      if (vendorMatch) {
        currentVendor = {
          id: vendorMatch[1].trim(),
          name: vendorMatch[2].replace(/\s*\*\s*$/, '').trim(),
        };
        inSpecialOrderSection = false;
        continue;
      }

      // Check for Special Order section header
      if (isSpecialOrderHeader(line)) {
        inSpecialOrderSection = true;
        continue;
      }

      // Skip empty lines
      if (!line.trim()) {
        continue;
      }

      // Exit special order section on certain patterns
      if (inSpecialOrderSection) {
        if (
          /^Vnd\s+\d+\s+SubTot/i.test(line) ||
          /^Cases\s*:/i.test(line) ||
          /^Prod#\s+Unt/i.test(line) ||
          /^\*\s*\*\s*\*\s*\*\s*\*/i.test(line)
        ) {
          inSpecialOrderSection = false;
        }
      }

      // ALWAYS try to detect PO lines (they can appear anywhere after a vendor header)
      if (currentVendor && isPODataLine(line)) {
        const po = parsePOLine(line, currentVendor, reportDate);
        if (po && !seenPONumbers.has(po.poNumber)) {
          seenPONumbers.add(po.poNumber);
          purchaseOrders.push(po);
          poLinesFound++;

          if (poLinesFound <= 5) {
            console.log('[PO Parser] Found PO:', po.poNumber, 'vendor:', po.vendorName.substring(0, 20), 'due:', po.dueDate, 'edi:', po.edi, 'appt:', po.appointment ? 'Yes' : 'No');
          }
        }
        continue;
      }

      // Parse Special Order lines
      if (inSpecialOrderSection && currentVendor) {
        const so = parseSpecialOrderLine(line, currentVendor);
        if (so) {
          specialOrders.push(so);
        }
        continue;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Line ${lineNum}: PO parse error - ${message}`);
    }
  }

  console.log('[PO Parser] Result: Found', purchaseOrders.length, 'POs,', specialOrders.length, 'Special Orders');

  // Log urgent PO summary
  const urgentPOs = purchaseOrders.filter(po => po.isUrgent);
  if (urgentPOs.length > 0) {
    console.log('[PO Parser] URGENT POs:', urgentPOs.length, 'requiring attention');
    const urgentCases = urgentPOs.reduce((sum, po) => sum + po.totalCases, 0);
    console.log('[PO Parser] Urgent cases at risk:', urgentCases);
  }

  return { purchaseOrders, specialOrders, errors };
}

/**
 * Calculate PO statistics
 */
export function calculatePOStats(
  purchaseOrders: PurchaseOrder[],
  specialOrders: SpecialOrder[],
  reportDate: Date
): POStats {
  // Calculate arrivals this week (within 7 days of report date)
  const thisWeekArrivals = purchaseOrders.filter(
    (po) => po.daysUntilDue >= 0 && po.daysUntilDue <= 7
  ).length;

  // Count unique vendors with POs
  const vendorsWithPOs = new Set(purchaseOrders.map((po) => po.vendorId)).size;

  // Total cases
  const totalCases = purchaseOrders.reduce((sum, po) => sum + po.totalCases, 0);

  // Urgent POs
  const urgentPOs = purchaseOrders.filter((po) => po.isUrgent);
  const urgentCases = urgentPOs.reduce((sum, po) => sum + po.totalCases, 0);

  // Missing EDI count (among urgent POs)
  const missingEDICount = urgentPOs.filter((po) =>
    po.urgentReasons.includes('No EDI confirmation')
  ).length;

  // Missing appointment count (among urgent POs)
  const missingAppointmentCount = urgentPOs.filter((po) =>
    po.urgentReasons.includes('No appointment')
  ).length;

  // Overdue POs
  const overduePOCount = purchaseOrders.filter((po) => po.daysUntilDue < 0).length;

  // Special order stats
  const readyCount = specialOrders.filter((so) => so.status === 'Ready').length;
  const doqCount = specialOrders.filter((so) => so.status === '*DOQ*').length;
  const pendingCount = specialOrders.filter((so) => so.status === 'Order').length;

  return {
    totalPOs: purchaseOrders.length,
    totalCases,
    vendorsWithPOs,
    thisWeekArrivals,
    specialOrderCount: specialOrders.length,
    readyCount,
    doqCount,
    pendingCount,
    urgentPOCount: urgentPOs.length,
    urgentCases,
    missingEDICount,
    missingAppointmentCount,
    overduePOCount,
  };
}

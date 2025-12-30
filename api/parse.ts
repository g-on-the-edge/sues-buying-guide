import type { VercelRequest, VercelResponse } from '@vercel/node';
import pdfParse from 'pdf-parse';

// ============================================================================
// Types
// ============================================================================

type Confidence = 'high' | 'medium' | 'low';

interface ParsedItem {
  vendorId: string;
  vendorName: string;
  prodNo: string;
  specialOrder: boolean;
  unit: string;
  size: string;
  brand: string;
  description: string;
  ytd: number | null;
  avg: number | null;
  avail: number | null;
  onOrder: number | null;
  daysSply: number | null;
  lndCst: number | null;
  mrkCst: number | null;
  slot: string | null;
  ip: number | null;
  confidence: Confidence;
  numericColumns: number;  // For debugging - how many numeric columns were found
  rawLine: string;
  parseNotes: string[];
}

interface ParseStats {
  totalItems: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  attentionCount: number;      // HIGH confidence, Sply <= 5
  attentionMediumCount: number; // MEDIUM confidence, Sply <= 5 (Watch List)
  criticalCount: number;        // HIGH confidence, Sply <= 2
  needsReviewCount: number;
  specialOrderCount: number;
  vendorCount: number;
}

interface PurchaseOrder {
  poNumber: string;
  vendorId: string;
  vendorName: string;
  dueDate: string;
  totalCases: number;
  status: string;
  edi: boolean | null;
  appointment: string | null;
  pickUp: string | null;
  entered: string | null;
  daysUntilDue: number;
  isUrgent: boolean;
  urgentReasons: string[];
}

interface SpecialOrder {
  prodNo: string;
  description: string;
  custNo: string;
  customerName: string;
  dateEntered: string;
  dateDoq: string | null;
  dateDue: string | null;
  poNumber: string | null;
  qtyOrdered: number;
  onHand: number;
  status: 'Ready' | '*DOQ*' | 'Order';
  vendorId: string;
  vendorName: string;
}

interface POStats {
  totalPOs: number;
  totalCases: number;
  vendorsWithPOs: number;
  thisWeekArrivals: number;
  specialOrderCount: number;
  readyCount: number;
  doqCount: number;
  pendingCount: number;
  urgentPOCount: number;
  urgentCases: number;
  missingEDICount: number;
  missingAppointmentCount: number;
  overduePOCount: number;
}

interface ParseResponse {
  items: ParsedItem[];
  purchaseOrders: PurchaseOrder[];
  specialOrders: SpecialOrder[];
  stats: ParseStats;
  poStats: POStats;
  reportDate: string | null;
  parseErrors: string[];
}

interface CurrentVendor {
  id: string;
  name: string;
}

interface TailParseResult {
  ip: number | null;
  slot: string | null;
  mrkCst: number | null;
  lndCst: number | null;
  daysSply: number | null;
  onOrder: number | null;
  avail: number | null;
  avg: number | null;
  confidence: Confidence;
  numericColumns: number;  // How many numeric columns were found before LndCst
  notes: string[];
  consumedCount: number;
}

interface FrontParseResult {
  prodNo: string;
  specialOrder: boolean;
  unit: string;
  size: string;
  brand: string;
  description: string;
  ytd: number | null;
}

// ============================================================================
// Line Parser
// ============================================================================

const SKIP_PATTERNS = [
  /^RUN DATE/i,
  /^RUN TIME/i,
  /^INVORD/i,
  /^Arrival date/i,
  /^BH\/Ship date/i,
  /^Phone\s*:/i,
  /^Buyer\s*:/i,
  /^Freight:/i,
  /^\*\s*\*\s*\*\s*\*\s*\*/,
  /^Prod#\s+Unt\s+Size/i,
  /^=+$/,
  /^-+$/,
  /^TiHi:/i,
  /^Cube:/i,
  /^Open P\.O\./i,
  /^P\.O\.\s+Due/i,
  /^Special Order summary/i,
  /^Vnd\s+\d+\s+SubTot/i,
  /^Cases\s*:/i,
  /^Dollars:/i,
  /^Ave\s+Gross/i,
  /^\s*$/,
  /^PAGE:/i,
  /^Performance Foodservice/i,
  /^Sort Option:/i,
  /^Min Order:/i,
  /^Min Type\s*:/i,
  /^Comment\d*:/i,
  /^Terms:/i,
  /^Frt Allow:/i,
  /^Net Freight:/i,
  /^On\s+Days$/i,
  /^Ordr Sply$/i,
  /^=====/,
];

const VENDOR_PATTERN = /^Vendor:\s*(\d+)\s+(.+?)(?:\s*\*?\s*Broker:|$)/i;

function shouldSkipLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return SKIP_PATTERNS.some(pattern => pattern.test(trimmed));
}

function parseVendorLine(line: string): CurrentVendor | null {
  const match = line.match(VENDOR_PATTERN);
  if (!match) return null;
  const vendorId = match[1].trim();
  let vendorName = match[2].trim();
  vendorName = vendorName.replace(/\s*\*\s*$/, '').trim();
  return { id: vendorId, name: vendorName };
}

function isProductNumber(token: string): boolean {
  return /^[A-Z0-9]{2,8}$/i.test(token);
}

function isFloat(token: string): boolean {
  const cleaned = token.replace(/-$/, '');
  return /^\d+\.\d+$/.test(cleaned);
}

function isInteger(token: string): boolean {
  return /^\d+$/.test(token);
}

function isSlotCode(token: string): boolean {
  return /^[A-Z]{1,3}\d{3,5}$|^COOLER$|^FREEZE$|^DRY$/i.test(token);
}

function parseTail(tokens: string[], isSpecialOrder: boolean): TailParseResult {
  const notes: string[] = [];
  let confidence: Confidence = 'high';

  let ip: number | null = null;
  let slot: string | null = null;
  let mrkCst: number | null = null;
  let lndCst: number | null = null;
  let daysSply: number | null = null;
  let onOrder: number | null = null;
  let avail: number | null = null;
  let avg: number | null = null;
  let consumedCount = 0;
  let numericColumns = 0;

  if (tokens.length < 4) {
    notes.push('Too few tokens for tail parsing');
    return { ip, slot, mrkCst, lndCst, daysSply, onOrder, avail, avg, confidence: 'low', numericColumns: 0, notes, consumedCount };
  }

  let idx = tokens.length - 1;

  // ============================================================================
  // COLUMN-COUNTING APPROACH (per spec v2)
  // Parse RIGHT-TO-LEFT: IP, Slot, MrkCst, LndCst are ALWAYS present
  // Then count remaining numeric columns to determine confidence
  //
  // NEW CONFIDENCE THRESHOLDS (v2):
  //   7+ numeric cols = HIGH confidence (lowered from 8)
  //   5-6 numeric cols = MEDIUM confidence (new tier)
  //   <5 cols = LOW confidence
  //
  // S/O items with 7+ columns NOW get HIGH confidence (was auto-LOW)
  // ============================================================================

  // IP (rightmost - always a float like 2.1, 4.5, etc)
  const ipToken = tokens[idx];
  const ipCleaned = ipToken.replace(/-$/, '');
  if (isFloat(ipCleaned)) {
    ip = parseFloat(ipCleaned);
    consumedCount++;
    idx--;
  } else {
    notes.push(`Expected IP as float, got: ${ipToken}`);
    confidence = 'low';
  }

  // Slot (second from right - alphanumeric code like DN4901, DRY, FREEZE)
  if (idx >= 0) {
    const slotToken = tokens[idx];
    if (isSlotCode(slotToken) || /^[A-Z0-9]+$/i.test(slotToken)) {
      slot = slotToken;
      consumedCount++;
      idx--;
    } else {
      notes.push(`Expected Slot code, got: ${slotToken}`);
      confidence = 'low';
    }
  }

  // MrkCst (market cost - float like 21.54)
  if (idx >= 0) {
    const mrkToken = tokens[idx];
    if (isFloat(mrkToken)) {
      mrkCst = parseFloat(mrkToken);
      consumedCount++;
      idx--;
    } else {
      notes.push(`Expected MrkCst as float, got: ${mrkToken}`);
      confidence = 'low';
    }
  }

  // LndCst (landed cost - float like 20.13)
  if (idx >= 0) {
    const lndToken = tokens[idx];
    if (isFloat(lndToken)) {
      lndCst = parseFloat(lndToken);
      consumedCount++;
      idx--;
    } else {
      notes.push(`Expected LndCst as float, got: ${lndToken}`);
      confidence = 'low';
    }
  }

  // ============================================================================
  // Now count numeric columns BEFORE LndCst (going right-to-left)
  // These are: Sply, Ordr?, Avail, Avg, Curr, Wk1, Wk2, Wk3, Y-T-D
  //
  // Full column order (left-to-right):
  //   Y-T-D Wk3 Wk2 Wk1 Curr Avg Avail Ordr Sply LndCst MrkCst Slot IP
  //
  // Days Supply is ALWAYS the last numeric value before LndCst (verified 99% accurate)
  // ============================================================================

  // Collect ALL numeric tokens from current position going left
  const numericTokens: string[] = [];
  let tempIdx = idx;
  while (tempIdx >= 0) {
    const token = tokens[tempIdx];
    if (isInteger(token) || isFloat(token)) {
      numericTokens.unshift(token); // Add to front (we're going backwards)
      tempIdx--;
    } else {
      break; // Stop at first non-numeric token (likely the description)
    }
  }

  const numCols = numericTokens.length;
  numericColumns = numCols;

  // ============================================================================
  // CONFIDENCE CLASSIFICATION (per spec v2)
  // 7+ columns = HIGH confidence
  // 5-6 columns = MEDIUM confidence
  // <5 columns = LOW confidence
  // ============================================================================

  // Days Supply is ALWAYS the rightmost numeric (index len-1) - verified 99% accurate
  if (numCols >= 1) {
    const splyToken = numericTokens[numCols - 1];
    daysSply = parseFloat(splyToken);
    consumedCount++;
  }

  if (numCols >= 7) {
    // HIGH confidence - 7+ columns
    const len = numericTokens.length;

    if (numCols >= 9) {
      // Full pattern WITH Ordr
      // From right: Sply=[len-1], Ordr=[len-2], Avail=[len-3], Avg=[len-4]
      const ordrToken = numericTokens[len - 2];
      const availToken = numericTokens[len - 3];
      const avgToken = numericTokens[len - 4];

      onOrder = parseInt(ordrToken, 10);
      avail = parseInt(availToken, 10);
      avg = parseInt(avgToken, 10);
      consumedCount += 3;
    } else if (numCols >= 8) {
      // 8 columns - NO Ordr
      // From right: Sply=[len-1], Avail=[len-2], Avg=[len-3]
      const availToken = numericTokens[len - 2];
      const avgToken = numericTokens[len - 3];

      onOrder = null;
      avail = parseInt(availToken, 10);
      avg = parseInt(avgToken, 10);
      consumedCount += 2;
    } else {
      // 7 columns - try to get Avail
      // From right: Sply=[len-1], Avail=[len-2]
      const availToken = numericTokens[len - 2];
      avail = parseInt(availToken, 10);
      consumedCount++;
    }

    // S/O items with 7+ columns NOW get HIGH confidence (changed from v1)
    if (isSpecialOrder) {
      notes.push('Special Order item with good data');
    }

    // Only override to low if we had tail parsing failures
    if (confidence !== 'low') {
      confidence = 'high';
    }
  } else if (numCols >= 5) {
    // MEDIUM confidence - 5-6 columns (new tier in v2)
    notes.push(`${numCols} numeric columns found - medium confidence`);

    // Try to get Avail
    if (numCols >= 2) {
      avail = parseInt(numericTokens[numCols - 2], 10);
      consumedCount++;
    }

    // Only set to medium if we didn't have tail parsing failures
    if (confidence !== 'low') {
      confidence = 'medium';
    }
  } else {
    // LOW confidence - <5 columns
    notes.push(`Only ${numCols} numeric columns found (need 5+ for medium, 7+ for high)`);
    confidence = 'low';

    // Still try to extract what we can
    if (numCols >= 2) {
      avail = parseInt(numericTokens[numCols - 2], 10);
      consumedCount++;
    }
    if (numCols >= 3) {
      avg = parseInt(numericTokens[numCols - 3], 10);
      consumedCount++;
    }
  }

  return { ip, slot, mrkCst, lndCst, daysSply, onOrder, avail, avg, confidence, numericColumns, notes, consumedCount };
}

function parseFront(tokens: string[]): FrontParseResult {
  let prodNo = '';
  let specialOrder = false;
  let unit = '';
  let size = '';
  let brand = '';
  let description = '';
  let ytd: number | null = null;

  let idx = 0;

  if (idx < tokens.length) {
    prodNo = tokens[idx];
    idx++;
  }

  if (idx < tokens.length && tokens[idx] === 'S/O') {
    specialOrder = true;
    unit = 'S/O';
    idx++;
  }

  if (idx < tokens.length && !specialOrder) {
    const token = tokens[idx];
    if (['CS', 'EA', 'BX', 'PK', 'BG', 'DZ', 'CT'].includes(token.toUpperCase())) {
      unit = token;
      idx++;
    }
  }

  const sizeTokens: string[] = [];
  while (idx < tokens.length) {
    const token = tokens[idx];
    if (/^\d+\/[\d.]+$/.test(token) ||
        /^[\d.]+\/[\d.]+$/.test(token) ||
        /^OZ$/i.test(token) ||
        /^LB$/i.test(token) ||
        /^GAL$/i.test(token) ||
        /^\d+\/\d+\s*OZ$/i.test(token) ||
        /^[\d.]+OZ$/i.test(token)) {
      sizeTokens.push(token);
      idx++;
    } else {
      break;
    }
  }
  size = sizeTokens.join(' ');

  if (idx < tokens.length) {
    brand = tokens[idx];
    idx++;
  }

  const descTokens: string[] = [];
  while (idx < tokens.length) {
    const token = tokens[idx];
    if (isInteger(token)) {
      let numericCount = 0;
      for (let j = idx; j < Math.min(idx + 4, tokens.length); j++) {
        if (isInteger(tokens[j]) || isFloat(tokens[j])) {
          numericCount++;
        }
      }
      if (numericCount >= 2) {
        ytd = parseInt(token, 10);
        break;
      }
    }
    descTokens.push(token);
    idx++;
  }
  description = descTokens.join(' ');

  return { prodNo, specialOrder, unit, size, brand, description, ytd };
}

function isItemLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 8) return false;

  if (!isProductNumber(tokens[0])) return false;

  let floatCount = 0;
  for (let i = tokens.length - 1; i >= Math.max(0, tokens.length - 6); i--) {
    if (isFloat(tokens[i]) || isFloat(tokens[i].replace(/-$/, ''))) {
      floatCount++;
    }
  }

  return floatCount >= 2;
}

function parseItemLine(line: string, vendor: CurrentVendor): ParsedItem {
  const trimmed = line.trim();
  const tokens = trimmed.split(/\s+/);

  // Parse front first to detect S/O (Special Order)
  const front = parseFront(tokens);
  // Pass specialOrder flag to parseTail for confidence determination
  const tail = parseTail(tokens, front.specialOrder);

  const item: ParsedItem = {
    vendorId: vendor.id,
    vendorName: vendor.name,
    prodNo: front.prodNo,
    specialOrder: front.specialOrder,
    unit: front.unit,
    size: front.size,
    brand: front.brand,
    description: front.description,
    ytd: front.ytd,
    avg: tail.avg,
    avail: tail.avail,
    onOrder: tail.onOrder,
    daysSply: tail.daysSply,
    lndCst: tail.lndCst,
    mrkCst: tail.mrkCst,
    slot: tail.slot,
    ip: tail.ip,
    confidence: tail.confidence,
    numericColumns: tail.numericColumns,
    rawLine: trimmed,
    parseNotes: tail.notes,
  };

  if (item.daysSply === null) {
    item.confidence = 'low';
    if (!item.parseNotes.includes('DaysSply is null')) {
      item.parseNotes.push('DaysSply is null - needs review');
    }
  }

  return item;
}

function parseAllLines(text: string): { items: ParsedItem[]; errors: string[] } {
  const lines = text.split('\n');
  const items: ParsedItem[] = [];
  const errors: string[] = [];

  let currentVendor: CurrentVendor | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    try {
      const vendor = parseVendorLine(line);
      if (vendor) {
        currentVendor = vendor;
        continue;
      }

      if (shouldSkipLine(line)) {
        continue;
      }

      if (!isItemLine(line)) {
        continue;
      }

      if (!currentVendor) {
        errors.push(`Line ${lineNum}: Item found before vendor declaration`);
        continue;
      }

      const item = parseItemLine(line, currentVendor);
      items.push(item);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Line ${lineNum}: Parse error - ${message}`);
    }
  }

  return { items, errors };
}

// ============================================================================
// PO Parser
// ============================================================================

const URGENT_WINDOW_DAYS = 5;

function parseDate(dateStr: string): Date | null {
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;
  const [, month, day, year] = match;
  const fullYear = parseInt(year, 10) + 2000;
  return new Date(fullYear, parseInt(month, 10) - 1, parseInt(day, 10));
}

function extractReportDate(text: string): Date | null {
  const match = text.match(/RUN DATE[:\s]*(\d{2}\/\d{2}\/\d{2})/i);
  if (!match) return null;
  return parseDate(match[1]);
}

function calculateDaysUntilDue(dueDate: string, reportDate: Date): number {
  const due = parseDate(dueDate);
  if (!due) return 0;
  const diffTime = due.getTime() - reportDate.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function isPODataLine(line: string): boolean {
  const trimmed = line.trim();
  if (!/^\d{5}\s/.test(trimmed)) return false;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 4) return false;
  if (!/^\d{5}$/.test(tokens[0])) return false;
  if (!/^\d{2}\/\d{2}\/\d{2}$/.test(tokens[1])) return false;
  if (!/^\d{1,5}$/.test(tokens[2])) return false;
  if (/^Conf:/i.test(tokens[3])) return true;
  const rest = tokens.slice(3).join(' ');
  if (/Conf:/i.test(rest)) return true;
  const dateMatches = trimmed.match(/\d{2}\/\d{2}\/\d{2}/g);
  const timeMatches = trimmed.match(/\d{2}:\d{2}/g);
  if (dateMatches && dateMatches.length >= 3) return true;
  if (timeMatches && timeMatches.length > 0) return true;
  return false;
}

function parsePOLine(line: string, vendor: CurrentVendor, reportDate: Date): PurchaseOrder | null {
  const trimmed = line.trim();
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 4) return null;

  const poNumber = tokens[0];
  if (!/^\d{5}$/.test(poNumber)) return null;

  const dueDate = tokens[1];
  if (!/^\d{2}\/\d{2}\/\d{2}$/.test(dueDate)) return null;

  const casesStr = tokens[2];
  if (!/^\d+$/.test(casesStr)) return null;
  const totalCases = parseInt(casesStr, 10);

  const restOfLine = tokens.slice(3).join(' ');
  let status = '';
  const statusMatch = restOfLine.match(/^(Conf:[^\s]+|Pending|Received)/);
  if (statusMatch) {
    status = statusMatch[1];
  } else {
    status = tokens[3] || '';
  }

  // EDI detection
  let edi: boolean | null = null;
  if (status.toLowerCase().includes('edi')) {
    edi = true;
  } else if (/\bYes\b/i.test(restOfLine)) {
    edi = true;
  } else if (/\bNo\b/i.test(restOfLine)) {
    edi = false;
  }
  if (edi === null && /^Conf:/i.test(status) && !status.toLowerCase().includes('edi')) {
    edi = false;
  }

  const dates = restOfLine.match(/\d{2}\/\d{2}\/\d{2}/g) || [];
  const times = restOfLine.match(/\d{2}:\d{2}/g) || [];

  let appointment: string | null = null;
  if (dates.length > 0 && times.length > 0) {
    appointment = `${dates[0]} ${times[0]}`;
  }

  let entered: string | null = null;
  if (dates.length > 0) {
    entered = dates[dates.length - 1];
  }

  const daysUntilDue = calculateDaysUntilDue(dueDate, reportDate);
  const urgentReasons: string[] = [];
  let isUrgent = false;

  if (daysUntilDue <= URGENT_WINDOW_DAYS) {
    if (!edi) {
      urgentReasons.push('No EDI confirmation');
      isUrgent = true;
    }
    if (!appointment) {
      urgentReasons.push('No appointment');
      isUrgent = true;
    }
  }

  return {
    poNumber,
    vendorId: vendor.id,
    vendorName: vendor.name,
    dueDate,
    totalCases,
    status,
    edi,
    appointment,
    pickUp: null,
    entered,
    daysUntilDue,
    isUrgent,
    urgentReasons,
  };
}

function isSpecialOrderHeader(line: string): boolean {
  return /Special Order summary for this vendor/i.test(line);
}

function parseSpecialOrderLine(line: string, vendor: CurrentVendor): SpecialOrder | null {
  const trimmed = line.trim();
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 6) return null;
  if (!/^[A-Z0-9]{2,8}$/i.test(tokens[0])) return null;

  const prodNo = tokens[0];
  const dates: string[] = trimmed.match(/\d{2}\/\d{2}\/\d{2}/g) || [];
  if (dates.length === 0) return null;

  const poMatch = trimmed.match(/\b(\d{5})\b/);
  const poNumber = poMatch ? poMatch[1] : null;

  let status: 'Ready' | '*DOQ*' | 'Order' = 'Order';
  if (trimmed.includes('*DOQ*')) {
    status = '*DOQ*';
  } else if (/\bReady\b/i.test(trimmed)) {
    status = 'Ready';
  }

  const descTokens: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^\d{2}\/\d{2}\/\d{2}$/.test(token)) break;
    if (/^\d{4}$/.test(token) && i > 2) break;
    descTokens.push(token);
  }

  return {
    prodNo,
    description: descTokens.join(' '),
    custNo: '',
    customerName: '',
    dateEntered: dates[0] || '',
    dateDoq: dates.length > 1 ? dates[1] : null,
    dateDue: dates.length > 2 ? dates[2] : null,
    poNumber,
    qtyOrdered: 0,
    onHand: 0,
    status,
    vendorId: vendor.id,
    vendorName: vendor.name,
  };
}

function parseAllPOs(text: string, reportDate: Date): { purchaseOrders: PurchaseOrder[]; specialOrders: SpecialOrder[]; errors: string[] } {
  const lines = text.split('\n');
  const purchaseOrders: PurchaseOrder[] = [];
  const specialOrders: SpecialOrder[] = [];
  const errors: string[] = [];
  const seenPONumbers = new Set<string>();

  let currentVendor: CurrentVendor | null = null;
  let inSpecialOrderSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      const vendorMatch = line.match(VENDOR_PATTERN);
      if (vendorMatch) {
        currentVendor = {
          id: vendorMatch[1].trim(),
          name: vendorMatch[2].replace(/\s*\*\s*$/, '').trim(),
        };
        inSpecialOrderSection = false;
        continue;
      }

      if (isSpecialOrderHeader(line)) {
        inSpecialOrderSection = true;
        continue;
      }

      if (!line.trim()) continue;

      if (inSpecialOrderSection) {
        if (/^Vnd\s+\d+\s+SubTot/i.test(line) || /^Cases\s*:/i.test(line) || /^Prod#\s+Unt/i.test(line)) {
          inSpecialOrderSection = false;
        }
      }

      if (currentVendor && isPODataLine(line)) {
        const po = parsePOLine(line, currentVendor, reportDate);
        if (po && !seenPONumbers.has(po.poNumber)) {
          seenPONumbers.add(po.poNumber);
          purchaseOrders.push(po);
        }
        continue;
      }

      if (inSpecialOrderSection && currentVendor) {
        const so = parseSpecialOrderLine(line, currentVendor);
        if (so) {
          specialOrders.push(so);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Line ${i + 1}: PO parse error - ${message}`);
    }
  }

  return { purchaseOrders, specialOrders, errors };
}

function calculatePOStats(purchaseOrders: PurchaseOrder[], specialOrders: SpecialOrder[], reportDate: Date): POStats {
  const thisWeekArrivals = purchaseOrders.filter(po => po.daysUntilDue >= 0 && po.daysUntilDue <= 7).length;
  const vendorsWithPOs = new Set(purchaseOrders.map(po => po.vendorId)).size;
  const totalCases = purchaseOrders.reduce((sum, po) => sum + po.totalCases, 0);
  const urgentPOs = purchaseOrders.filter(po => po.isUrgent);
  const urgentCases = urgentPOs.reduce((sum, po) => sum + po.totalCases, 0);
  const missingEDICount = urgentPOs.filter(po => po.urgentReasons.includes('No EDI confirmation')).length;
  const missingAppointmentCount = urgentPOs.filter(po => po.urgentReasons.includes('No appointment')).length;
  const overduePOCount = purchaseOrders.filter(po => po.daysUntilDue < 0).length;
  const readyCount = specialOrders.filter(so => so.status === 'Ready').length;
  const doqCount = specialOrders.filter(so => so.status === '*DOQ*').length;
  const pendingCount = specialOrders.filter(so => so.status === 'Order').length;

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

// ============================================================================
// PDF Parser
// ============================================================================

async function extractWithPdfParse(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}

function isValidExtraction(text: string): boolean {
  if (text.length < 100) {
    return false;
  }

  const hasVendor = /Vendor:\s*\d+/i.test(text);
  const hasProdHeader = /Prod#/i.test(text);
  const hasLineItem = /^[A-Z0-9]{2,8}\s+(CS|S\/O)/im.test(text);

  return hasVendor || hasProdHeader || hasLineItem;
}

function calculateStats(items: ParsedItem[]): ParseStats {
  const highConfidence = items.filter(i => i.confidence === 'high');
  const mediumConfidence = items.filter(i => i.confidence === 'medium');
  const lowConfidence = items.filter(i => i.confidence === 'low');

  // HIGH confidence attention items (Sply <= 5)
  const attention = highConfidence.filter(
    i => i.daysSply !== null && i.daysSply <= 5
  );

  // MEDIUM confidence attention items (Sply <= 5) - "Watch List"
  const attentionMedium = mediumConfidence.filter(
    i => i.daysSply !== null && i.daysSply <= 5
  );

  // Critical items (HIGH confidence, Sply <= 2)
  const critical = highConfidence.filter(
    i => i.daysSply !== null && i.daysSply <= 2
  );

  // Needs Review = LOW confidence only (not medium)
  const needsReview = items.filter(
    i => i.confidence === 'low' || i.daysSply === null
  );

  const specialOrders = items.filter(i => i.specialOrder);
  const uniqueVendors = new Set(items.map(i => i.vendorId));

  return {
    totalItems: items.length,
    highConfidenceCount: highConfidence.length,
    mediumConfidenceCount: mediumConfidence.length,
    lowConfidenceCount: lowConfidence.length,
    attentionCount: attention.length,
    attentionMediumCount: attentionMedium.length,
    criticalCount: critical.length,
    needsReviewCount: needsReview.length,
    specialOrderCount: specialOrders.length,
    vendorCount: uniqueVendors.size,
  };
}

async function parsePdf(buffer: Buffer): Promise<ParseResponse> {
  const parseErrors: string[] = [];

  const extractedText = await extractWithPdfParse(buffer);

  if (!isValidExtraction(extractedText)) {
    throw new Error('PDF extraction produced insufficient or invalid content');
  }

  // Extract report date
  const reportDate = extractReportDate(extractedText) || new Date();
  const reportDateStr = reportDate.toISOString().split('T')[0];

  // Parse items
  const { items, errors } = parseAllLines(extractedText);
  parseErrors.push(...errors);

  // Parse POs and Special Orders
  const { purchaseOrders, specialOrders, errors: poErrors } = parseAllPOs(extractedText, reportDate);
  parseErrors.push(...poErrors);

  const stats = calculateStats(items);
  const poStats = calculatePOStats(purchaseOrders, specialOrders, reportDate);

  return {
    items,
    purchaseOrders,
    specialOrders,
    stats,
    poStats,
    reportDate: reportDateStr,
    parseErrors,
  };
}

// ============================================================================
// Multipart Form Parser (for Vercel)
// ============================================================================

interface ParsedFile {
  filename: string;
  buffer: Buffer;
  mimetype: string;
}

async function parseMultipartForm(req: VercelRequest): Promise<ParsedFile | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';

      if (!contentType.includes('multipart/form-data')) {
        resolve(null);
        return;
      }

      const boundaryMatch = contentType.match(/boundary=(.+)/);
      if (!boundaryMatch) {
        resolve(null);
        return;
      }

      const boundary = boundaryMatch[1];
      const boundaryBuffer = Buffer.from(`--${boundary}`);

      // Find file content between boundaries
      const bodyStr = body.toString('binary');
      const parts = bodyStr.split(`--${boundary}`);

      for (const part of parts) {
        if (part.includes('filename=')) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd === -1) continue;

          const headers = part.substring(0, headerEnd);
          const filenameMatch = headers.match(/filename="([^"]+)"/);
          const contentTypeMatch = headers.match(/Content-Type:\s*(.+)/i);

          if (filenameMatch) {
            // Extract binary content after headers
            const contentStart = headerEnd + 4;
            let contentEnd = part.length;

            // Remove trailing boundary markers
            if (part.endsWith('--\r\n')) {
              contentEnd -= 4;
            } else if (part.endsWith('\r\n')) {
              contentEnd -= 2;
            }

            const content = part.substring(contentStart, contentEnd);
            const fileBuffer = Buffer.from(content, 'binary');

            resolve({
              filename: filenameMatch[1],
              buffer: fileBuffer,
              mimetype: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/pdf',
            });
            return;
          }
        }
      }

      resolve(null);
    });

    req.on('error', reject);
  });
}

// ============================================================================
// Vercel Handler
// ============================================================================

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const file = await parseMultipartForm(req);

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!file.filename.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ message: 'Only PDF files are allowed' });
    }

    const result = await parsePdf(file.buffer);

    return res.status(200).json(result);

  } catch (error) {
    console.error('Parse error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return res.status(500).json({ message: `Failed to parse PDF: ${message}` });
  }
}

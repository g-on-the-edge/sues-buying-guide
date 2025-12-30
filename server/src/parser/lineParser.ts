import {
  ParsedItem,
  CurrentVendor,
  TailParseResult,
  FrontParseResult,
} from '../types';

/**
 * Lines to skip during parsing
 */
const SKIP_PATTERNS = [
  /^RUN DATE/i,
  /^RUN TIME/i,
  /^INVORD/i,
  /^Arrival date/i,
  /^BH\/Ship date/i,
  /^Phone\s*:/i,
  /^Buyer\s*:/i,
  /^Freight:/i,
  /^\*\s*\*\s*\*\s*\*\s*\*/,  // ***** Sales *****
  /^Prod#\s+Unt\s+Size/i,     // Column headers
  /^=+$/,                      // Separator lines
  /^-+$/,                      // Dashed separator lines
  /^TiHi:/i,                   // TiHi metadata line
  /^Cube:/i,                   // Cube metadata line
  /^Open P\.O\./i,             // Purchase order summary
  /^P\.O\.\s+Due/i,            // PO header
  /^Special Order summary/i,
  /^Vnd\s+\d+\s+SubTot/i,      // Vendor subtotals
  /^Cases\s*:/i,
  /^Dollars:/i,
  /^Ave\s+Gross/i,
  /^\s*$/,                     // Empty lines
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
  /^=====/,                    // Any line starting with multiple =
];

/**
 * Pattern to detect vendor lines
 * Example: "Vendor: 00001740 FRITO LAY * Broker:"
 */
const VENDOR_PATTERN = /^Vendor:\s*(\d+)\s+(.+?)(?:\s*\*?\s*Broker:|$)/i;

/**
 * Check if a line should be skipped
 */
export function shouldSkipLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;

  return SKIP_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Parse vendor information from a line
 */
export function parseVendorLine(line: string): CurrentVendor | null {
  const match = line.match(VENDOR_PATTERN);
  if (!match) return null;

  const vendorId = match[1].trim();
  let vendorName = match[2].trim();

  // Remove trailing asterisk and whitespace
  vendorName = vendorName.replace(/\s*\*\s*$/, '').trim();

  return { id: vendorId, name: vendorName };
}

/**
 * Check if a token looks like a product number
 * Product numbers are alphanumeric, 2-8 characters, often start with numbers or letters
 */
function isProductNumber(token: string): boolean {
  return /^[A-Z0-9]{2,8}$/i.test(token);
}

/**
 * Check if a token is a float (cost or IP value)
 */
function isFloat(token: string): boolean {
  // Handle trailing dash (negative indicator in some cases)
  const cleaned = token.replace(/-$/, '');
  return /^\d+\.\d+$/.test(cleaned);
}

/**
 * Check if a token is an integer
 */
function isInteger(token: string): boolean {
  return /^\d+$/.test(token);
}

/**
 * Check if a token looks like a slot code
 * Slot codes are alphanumeric, typically like "DL3400", "COOLER", "FREEZE", "DRY"
 */
function isSlotCode(token: string): boolean {
  return /^[A-Z]{1,3}\d{3,5}$|^COOLER$|^FREEZE$|^DRY$/i.test(token);
}

/**
 * Parse the tail of an item line (right to left)
 * Expected pattern: ... Avail Ordr Sply LndCst MrkCst Slot IP
 */
export function parseTail(tokens: string[]): TailParseResult {
  const notes: string[] = [];
  let confidence: 'high' | 'low' = 'high';

  // Initialize all values as null
  let ip: number | null = null;
  let slot: string | null = null;
  let mrkCst: number | null = null;
  let lndCst: number | null = null;
  let daysSply: number | null = null;
  let onOrder: number | null = null;
  let avail: number | null = null;
  let consumedCount = 0;

  if (tokens.length < 4) {
    notes.push('Too few tokens for tail parsing');
    return { ip, slot, mrkCst, lndCst, daysSply, onOrder, avail, confidence: 'low', notes, consumedCount };
  }

  // Work from the end
  let idx = tokens.length - 1;

  // IP - last token, should be float (may have trailing dash)
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

  // Slot - token before IP, should be alphanumeric slot code
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

  // MrkCst - float before Slot
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

  // LndCst - float before MrkCst
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

  // Now we need to find Sply, Ordr, Avail
  // These should be numbers, but S/O items might not have them
  // Sply should be immediately before LndCst

  if (idx >= 0) {
    const splyToken = tokens[idx];
    // Sply can be an integer or a float (like 4.2 for 4.2 days)
    if (isFloat(splyToken) || isInteger(splyToken)) {
      daysSply = parseFloat(splyToken);
      consumedCount++;
      idx--;
    } else {
      notes.push(`Expected DaysSply as number, got: ${splyToken}`);
      confidence = 'low';
    }
  }

  // Ordr - integer before Sply
  if (idx >= 0) {
    const ordrToken = tokens[idx];
    if (isInteger(ordrToken)) {
      onOrder = parseInt(ordrToken, 10);
      consumedCount++;
      idx--;
    } else {
      // This might be a case where Ordr is missing (S/O item)
      notes.push(`Expected Ordr as integer, got: ${ordrToken}`);
      confidence = 'low';
    }
  }

  // Avail - integer before Ordr
  if (idx >= 0) {
    const availToken = tokens[idx];
    if (isInteger(availToken)) {
      avail = parseInt(availToken, 10);
      consumedCount++;
      idx--;
    } else {
      // This might be Avg instead of Avail in some formats
      notes.push(`Expected Avail as integer, got: ${availToken}`);
      confidence = 'low';
    }
  }

  return { ip, slot, mrkCst, lndCst, daysSply, onOrder, avail, confidence, notes, consumedCount };
}

/**
 * Parse the front of an item line (left to right)
 */
export function parseFront(tokens: string[]): FrontParseResult {
  let prodNo = '';
  let specialOrder = false;
  let unit = '';
  let size = '';
  let brand = '';
  let description = '';
  let ytd: number | null = null;

  let idx = 0;

  // ProdNo - first token
  if (idx < tokens.length) {
    prodNo = tokens[idx];
    idx++;
  }

  // Check for S/O (Special Order)
  if (idx < tokens.length && tokens[idx] === 'S/O') {
    specialOrder = true;
    unit = 'S/O';
    idx++;
  }

  // Unit (CS, S/O already captured, etc.)
  if (idx < tokens.length && !specialOrder) {
    const token = tokens[idx];
    if (['CS', 'EA', 'BX', 'PK', 'BG', 'DZ', 'CT'].includes(token.toUpperCase())) {
      unit = token;
      idx++;
    }
  }

  // Size - often looks like "72/1" "OZ" or "8/1" "LB" or "104/.7OZ"
  // Collect size tokens until we hit what looks like a brand name
  const sizeTokens: string[] = [];
  while (idx < tokens.length) {
    const token = tokens[idx];
    // Size tokens often contain numbers, slashes, or unit measurements
    if (/^\d+\/[\d.]+$/.test(token) || // "72/1", "104/.7"
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

  // Brand - next token after size (usually all caps brand name)
  if (idx < tokens.length) {
    brand = tokens[idx];
    idx++;
  }

  // Description - tokens from here until we hit numeric sales data
  const descTokens: string[] = [];
  while (idx < tokens.length) {
    const token = tokens[idx];
    // Stop when we hit what looks like sales numbers (Y-T-D column starts numeric sequence)
    // Sales data is a sequence of integers, so stop at first purely numeric token
    // that's followed by more numeric tokens
    if (isInteger(token)) {
      // Look ahead to see if this starts a numeric sequence
      let numericCount = 0;
      for (let j = idx; j < Math.min(idx + 4, tokens.length); j++) {
        if (isInteger(tokens[j]) || isFloat(tokens[j])) {
          numericCount++;
        }
      }
      if (numericCount >= 2) {
        // This looks like the start of sales data
        // Try to capture Y-T-D
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

/**
 * Check if a line looks like an item line (candidate for parsing)
 */
export function isItemLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 8) return false;

  // First token should be a product number
  if (!isProductNumber(tokens[0])) return false;

  // Should have at least two floats (costs) near the end
  let floatCount = 0;
  for (let i = tokens.length - 1; i >= Math.max(0, tokens.length - 6); i--) {
    if (isFloat(tokens[i]) || isFloat(tokens[i].replace(/-$/, ''))) {
      floatCount++;
    }
  }

  return floatCount >= 2;
}

/**
 * Parse a single item line
 */
export function parseItemLine(line: string, vendor: CurrentVendor): ParsedItem {
  const trimmed = line.trim();
  const tokens = trimmed.split(/\s+/);

  // Parse tail (right to left) for numeric columns
  const tail = parseTail(tokens);

  // Parse front (left to right) for identification
  const front = parseFront(tokens);

  // Build the item
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
    avail: tail.avail,
    onOrder: tail.onOrder,
    daysSply: tail.daysSply,
    lndCst: tail.lndCst,
    mrkCst: tail.mrkCst,
    slot: tail.slot,
    ip: tail.ip,
    confidence: tail.confidence,
    rawLine: trimmed,
    parseNotes: tail.notes,
  };

  // Additional validation for confidence
  if (item.daysSply === null) {
    item.confidence = 'low';
    if (!item.parseNotes.includes('DaysSply is null')) {
      item.parseNotes.push('DaysSply is null - needs review');
    }
  }

  return item;
}

/**
 * Parse all lines from extracted PDF text
 */
export function parseAllLines(text: string): { items: ParsedItem[]; errors: string[] } {
  const lines = text.split('\n');
  const items: ParsedItem[] = [];
  const errors: string[] = [];

  let currentVendor: CurrentVendor | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    try {
      // Check for vendor line
      const vendor = parseVendorLine(line);
      if (vendor) {
        currentVendor = vendor;
        continue;
      }

      // Skip non-item lines
      if (shouldSkipLine(line)) {
        continue;
      }

      // Check if this is an item line
      if (!isItemLine(line)) {
        continue;
      }

      // Must have a current vendor
      if (!currentVendor) {
        errors.push(`Line ${lineNum}: Item found before vendor declaration`);
        continue;
      }

      // Parse the item
      const item = parseItemLine(line, currentVendor);
      items.push(item);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Line ${lineNum}: Parse error - ${message}`);
    }
  }

  return { items, errors };
}

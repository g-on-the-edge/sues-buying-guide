import type { VercelRequest, VercelResponse } from '@vercel/node';
import pdfParse from 'pdf-parse';

// ============================================================================
// Types
// ============================================================================

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
  avail: number | null;
  onOrder: number | null;
  daysSply: number | null;
  lndCst: number | null;
  mrkCst: number | null;
  slot: string | null;
  ip: number | null;
  confidence: 'high' | 'low';
  rawLine: string;
  parseNotes: string[];
}

interface ParseStats {
  totalItems: number;
  highConfidenceCount: number;
  lowConfidenceCount: number;
  attentionCount: number;
  criticalCount: number;
  needsReviewCount: number;
  vendorCount: number;
}

interface ParseResponse {
  items: ParsedItem[];
  stats: ParseStats;
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
  confidence: 'high' | 'low';
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

function parseTail(tokens: string[]): TailParseResult {
  const notes: string[] = [];
  let confidence: 'high' | 'low' = 'high';

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

  let idx = tokens.length - 1;

  // IP
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

  // Slot
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

  // MrkCst
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

  // LndCst
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

  // Sply
  if (idx >= 0) {
    const splyToken = tokens[idx];
    if (isFloat(splyToken) || isInteger(splyToken)) {
      daysSply = parseFloat(splyToken);
      consumedCount++;
      idx--;
    } else {
      notes.push(`Expected DaysSply as number, got: ${splyToken}`);
      confidence = 'low';
    }
  }

  // Ordr
  if (idx >= 0) {
    const ordrToken = tokens[idx];
    if (isInteger(ordrToken)) {
      onOrder = parseInt(ordrToken, 10);
      consumedCount++;
      idx--;
    } else {
      notes.push(`Expected Ordr as integer, got: ${ordrToken}`);
      confidence = 'low';
    }
  }

  // Avail
  if (idx >= 0) {
    const availToken = tokens[idx];
    if (isInteger(availToken)) {
      avail = parseInt(availToken, 10);
      consumedCount++;
      idx--;
    } else {
      notes.push(`Expected Avail as integer, got: ${availToken}`);
      confidence = 'low';
    }
  }

  return { ip, slot, mrkCst, lndCst, daysSply, onOrder, avail, confidence, notes, consumedCount };
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

  const tail = parseTail(tokens);
  const front = parseFront(tokens);

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
  const lowConfidence = items.filter(i => i.confidence === 'low');

  const attention = highConfidence.filter(
    i => i.daysSply !== null && i.daysSply <= 5
  );

  const critical = highConfidence.filter(
    i => i.daysSply !== null && i.daysSply <= 2
  );

  const needsReview = items.filter(
    i => i.confidence === 'low' || i.daysSply === null
  );

  const uniqueVendors = new Set(items.map(i => i.vendorId));

  return {
    totalItems: items.length,
    highConfidenceCount: highConfidence.length,
    lowConfidenceCount: lowConfidence.length,
    attentionCount: attention.length,
    criticalCount: critical.length,
    needsReviewCount: needsReview.length,
    vendorCount: uniqueVendors.size,
  };
}

async function parsePdf(buffer: Buffer): Promise<ParseResponse> {
  const parseErrors: string[] = [];

  const extractedText = await extractWithPdfParse(buffer);

  if (!isValidExtraction(extractedText)) {
    throw new Error('PDF extraction produced insufficient or invalid content');
  }

  const { items, errors } = parseAllLines(extractedText);
  parseErrors.push(...errors);

  const stats = calculateStats(items);

  return {
    items,
    stats,
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

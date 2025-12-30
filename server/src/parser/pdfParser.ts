import pdfParse from 'pdf-parse';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { ParsedItem, ParseStats, ParseResponse } from '../types';
import { parseAllLines } from './lineParser';
import { parseAllPOs, calculatePOStats, extractReportDate } from './poParser';

// Disable worker for Node.js environment
GlobalWorkerOptions.workerSrc = '';

/**
 * Extract text from PDF using pdf-parse (primary method)
 */
async function extractWithPdfParse(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (err) {
    console.error('pdf-parse extraction failed:', err);
    throw err;
  }
}

/**
 * Extract text from PDF using pdfjs-dist (fallback method)
 */
async function extractWithPdfjs(buffer: Buffer): Promise<string> {
  try {
    const uint8Array = new Uint8Array(buffer);
    const doc = await getDocument({ data: uint8Array }).promise;

    const textParts: string[] = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Group text items by their y-position to reconstruct lines
      const lineMap = new Map<number, { x: number; str: string }[]>();

      for (const item of textContent.items) {
        if ('str' in item && item.str) {
          // Round y to group items on same line
          const y = Math.round((item as any).transform[5]);
          const x = (item as any).transform[4];

          if (!lineMap.has(y)) {
            lineMap.set(y, []);
          }
          lineMap.get(y)!.push({ x, str: item.str });
        }
      }

      // Sort lines by y-position (descending for top-to-bottom)
      const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);

      for (const y of sortedYs) {
        const items = lineMap.get(y)!;
        // Sort items on same line by x-position
        items.sort((a, b) => a.x - b.x);
        const lineText = items.map(i => i.str).join(' ');
        textParts.push(lineText);
      }

      textParts.push('\n--- PAGE BREAK ---\n');
    }

    return textParts.join('\n');
  } catch (err) {
    console.error('pdfjs-dist extraction failed:', err);
    throw err;
  }
}

/**
 * Validate extracted text quality
 */
function isValidExtraction(text: string): boolean {
  // Check for minimum length
  if (text.length < 100) {
    return false;
  }

  // Check for expected content markers
  const hasVendor = /Vendor:\s*\d+/i.test(text);
  const hasProdHeader = /Prod#/i.test(text);
  const hasLineItem = /^[A-Z0-9]{2,8}\s+(CS|S\/O)/im.test(text);

  return hasVendor || hasProdHeader || hasLineItem;
}

/**
 * Calculate statistics from parsed items
 */
function calculateStats(items: ParsedItem[]): ParseStats {
  const highConfidence = items.filter(i => i.confidence === 'high');
  const lowConfidence = items.filter(i => i.confidence === 'low');

  // Attention: high confidence AND daysSply <= 5
  const attention = highConfidence.filter(
    i => i.daysSply !== null && i.daysSply <= 5
  );

  // Critical: high confidence AND daysSply <= 2
  const critical = highConfidence.filter(
    i => i.daysSply !== null && i.daysSply <= 2
  );

  // Needs Review: low confidence OR daysSply is null
  const needsReview = items.filter(
    i => i.confidence === 'low' || i.daysSply === null
  );

  // Count unique vendors
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

/**
 * Main PDF parsing function
 */
export async function parsePdf(buffer: Buffer): Promise<ParseResponse> {
  let extractedText: string;
  const parseErrors: string[] = [];

  // Try primary extraction method
  try {
    extractedText = await extractWithPdfParse(buffer);

    // Validate extraction quality
    if (!isValidExtraction(extractedText)) {
      console.log('Primary extraction invalid, trying fallback...');
      parseErrors.push('Primary PDF extraction produced insufficient content, using fallback');
      extractedText = await extractWithPdfjs(buffer);
    }
  } catch (primaryErr) {
    // Fallback to pdfjs-dist
    console.log('Primary extraction failed, trying fallback...');
    parseErrors.push(`Primary PDF extraction failed: ${primaryErr instanceof Error ? primaryErr.message : String(primaryErr)}`);

    try {
      extractedText = await extractWithPdfjs(buffer);
    } catch (fallbackErr) {
      throw new Error(
        `Both PDF extraction methods failed. Primary: ${primaryErr instanceof Error ? primaryErr.message : String(primaryErr)}. Fallback: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`
      );
    }
  }

  // Final validation
  if (!isValidExtraction(extractedText)) {
    throw new Error('PDF extraction produced insufficient or invalid content');
  }

  // Extract report date from the PDF
  const reportDate = extractReportDate(extractedText) || new Date();
  const reportDateStr = reportDate.toISOString().split('T')[0];

  // Debug: Log text sample to understand what we're parsing
  console.log('[PDF Parser] Extracted text length:', extractedText.length);
  console.log('[PDF Parser] Report date:', reportDateStr);
  console.log('[PDF Parser] First 500 chars:', extractedText.substring(0, 500));
  console.log('[PDF Parser] Contains "Open P.O.":', extractedText.includes('Open P.O.'));
  console.log('[PDF Parser] Contains "P.O.":', extractedText.includes('P.O.'));

  // Parse the extracted text for items
  const { items, errors } = parseAllLines(extractedText);

  // Parse POs and Special Orders
  const { purchaseOrders, specialOrders, errors: poErrors } = parseAllPOs(
    extractedText,
    reportDate
  );

  // Add any parse errors to response
  parseErrors.push(...errors, ...poErrors);

  // Calculate statistics
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

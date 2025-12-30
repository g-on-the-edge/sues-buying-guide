import * as XLSX from 'xlsx';
import { ParsedItem, VendorGroup } from '../types';

/**
 * Filter items by attention level (daysSply <= 5)
 */
export function getAttentionItems(items: ParsedItem[]): ParsedItem[] {
  return items.filter(
    i => i.confidence === 'high' && i.daysSply !== null && i.daysSply <= 5
  );
}

/**
 * Filter items by critical level (daysSply <= 2)
 */
export function getCriticalItems(items: ParsedItem[]): ParsedItem[] {
  return items.filter(
    i => i.confidence === 'high' && i.daysSply !== null && i.daysSply <= 2
  );
}

/**
 * Filter items needing review (low confidence or null daysSply)
 */
export function getNeedsReviewItems(items: ParsedItem[]): ParsedItem[] {
  return items.filter(
    i => i.confidence === 'low' || i.daysSply === null
  );
}

/**
 * Get high confidence items
 */
export function getHighConfidenceItems(items: ParsedItem[]): ParsedItem[] {
  return items.filter(i => i.confidence === 'high');
}

/**
 * Group items by vendor
 */
export function groupByVendor(items: ParsedItem[]): VendorGroup[] {
  const vendorMap = new Map<string, VendorGroup>();

  for (const item of items) {
    if (!vendorMap.has(item.vendorId)) {
      vendorMap.set(item.vendorId, {
        vendorId: item.vendorId,
        vendorName: item.vendorName,
        items: [],
        criticalCount: 0,
        attentionCount: 0,
        reviewCount: 0,
      });
    }

    const group = vendorMap.get(item.vendorId)!;
    group.items.push(item);

    // Update counts
    if (item.confidence === 'low' || item.daysSply === null) {
      group.reviewCount++;
    } else if (item.daysSply <= 2) {
      group.criticalCount++;
      group.attentionCount++;
    } else if (item.daysSply <= 5) {
      group.attentionCount++;
    }
  }

  // Sort by vendor name
  return Array.from(vendorMap.values()).sort((a, b) =>
    a.vendorName.localeCompare(b.vendorName)
  );
}

/**
 * Convert items to worksheet data
 */
function itemsToSheetData(items: ParsedItem[]): object[] {
  return items.map(item => ({
    'Vendor ID': item.vendorId,
    'Vendor Name': item.vendorName,
    'Prod#': item.prodNo,
    'S/O': item.specialOrder ? 'Yes' : '',
    'Unit': item.unit,
    'Size': item.size,
    'Brand': item.brand,
    'Description': item.description,
    'Y-T-D': item.ytd ?? '',
    'Avail': item.avail ?? '',
    'On Order': item.onOrder ?? '',
    'Days Sply': item.daysSply ?? '',
    'Lnd Cost': item.lndCst ?? '',
    'Mrk Cost': item.mrkCst ?? '',
    'Slot': item.slot ?? '',
    'IP': item.ip ?? '',
    'Confidence': item.confidence,
    'Notes': item.parseNotes.join('; '),
  }));
}

/**
 * Export to Excel with multiple sheets
 */
export function exportToExcel(items: ParsedItem[], filename: string = 'sues-buying-guide.xlsx'): void {
  const wb = XLSX.utils.book_new();

  // Attention sheet (≤5 days)
  const attentionItems = getAttentionItems(items);
  const attentionData = itemsToSheetData(attentionItems);
  const attentionSheet = XLSX.utils.json_to_sheet(attentionData);
  XLSX.utils.book_append_sheet(wb, attentionSheet, 'Attention (≤5 days)');

  // Critical sheet (≤2 days)
  const criticalItems = getCriticalItems(items);
  const criticalData = itemsToSheetData(criticalItems);
  const criticalSheet = XLSX.utils.json_to_sheet(criticalData);
  XLSX.utils.book_append_sheet(wb, criticalSheet, 'Critical (≤2 days)');

  // Needs Review sheet
  const reviewItems = getNeedsReviewItems(items);
  const reviewData = itemsToSheetData(reviewItems);
  const reviewSheet = XLSX.utils.json_to_sheet(reviewData);
  XLSX.utils.book_append_sheet(wb, reviewSheet, 'Needs Review');

  // Download
  XLSX.writeFile(wb, filename);
}

/**
 * Export current view to CSV
 */
export function exportToCSV(items: ParsedItem[], filename: string = 'sues-buying-guide.csv'): void {
  const data = itemsToSheetData(items);
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Generate email summary text
 */
export function generateEmailSummary(items: ParsedItem[]): string {
  const groups = groupByVendor(getAttentionItems(items));
  const criticalItems = getCriticalItems(items);
  const reviewItems = getNeedsReviewItems(items);

  let summary = `INVENTORY ATTENTION REPORT\n`;
  summary += `Generated: ${new Date().toLocaleString()}\n`;
  summary += `${'='.repeat(50)}\n\n`;

  summary += `SUMMARY:\n`;
  summary += `  - Items needing attention (≤5 days): ${getAttentionItems(items).length}\n`;
  summary += `  - CRITICAL items (≤2 days): ${criticalItems.length}\n`;
  summary += `  - Items needing review: ${reviewItems.length}\n\n`;

  if (criticalItems.length > 0) {
    summary += `CRITICAL ITEMS (≤2 DAYS SUPPLY):\n`;
    summary += `${'-'.repeat(40)}\n`;
    for (const item of criticalItems) {
      summary += `  ${item.prodNo} - ${item.brand} ${item.description}\n`;
      summary += `    Vendor: ${item.vendorName}\n`;
      summary += `    Avail: ${item.avail ?? 'N/A'}, On Order: ${item.onOrder ?? 'N/A'}, Days: ${item.daysSply}\n\n`;
    }
  }

  summary += `\nATTENTION BY VENDOR:\n`;
  summary += `${'='.repeat(50)}\n\n`;

  for (const group of groups) {
    summary += `${group.vendorName} (ID: ${group.vendorId})\n`;
    summary += `  Critical: ${group.criticalCount}, Attention: ${group.attentionCount}\n`;
    summary += `${'-'.repeat(40)}\n`;

    for (const item of group.items) {
      if (item.confidence === 'high' && item.daysSply !== null && item.daysSply <= 5) {
        const critical = item.daysSply <= 2 ? ' [CRITICAL]' : '';
        summary += `  ${item.prodNo} - ${item.brand} ${item.description}${critical}\n`;
        summary += `    Avail: ${item.avail ?? 'N/A'}, On Order: ${item.onOrder ?? 'N/A'}, Days: ${item.daysSply}\n`;
      }
    }
    summary += '\n';
  }

  if (reviewItems.length > 0) {
    summary += `\nITEMS NEEDING REVIEW:\n`;
    summary += `${'-'.repeat(40)}\n`;
    for (const item of reviewItems.slice(0, 10)) {
      summary += `  ${item.prodNo} - ${item.brand} ${item.description}\n`;
      summary += `    Reason: ${item.parseNotes.join(', ') || 'Low confidence parse'}\n`;
    }
    if (reviewItems.length > 10) {
      summary += `  ... and ${reviewItems.length - 10} more\n`;
    }
  }

  return summary;
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
}

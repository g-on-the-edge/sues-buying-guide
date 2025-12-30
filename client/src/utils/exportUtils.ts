import * as XLSX from 'xlsx';
import { ParsedItem, VendorGroup, PurchaseOrder, SpecialOrder } from '../types';

/**
 * Filter items by attention level (HIGH confidence, daysSply <= 5)
 */
export function getAttentionItems(items: ParsedItem[]): ParsedItem[] {
  return items.filter(
    i => i.confidence === 'high' && i.daysSply !== null && i.daysSply <= 5
  );
}

/**
 * Filter items by critical level (HIGH confidence, daysSply <= 2)
 */
export function getCriticalItems(items: ParsedItem[]): ParsedItem[] {
  return items.filter(
    i => i.confidence === 'high' && i.daysSply !== null && i.daysSply <= 2
  );
}

/**
 * Filter items for watch list (MEDIUM confidence, daysSply <= 5)
 */
export function getWatchListItems(items: ParsedItem[]): ParsedItem[] {
  return items.filter(
    i => i.confidence === 'medium' && i.daysSply !== null && i.daysSply <= 5
  );
}

/**
 * Filter items needing review (LOW confidence or null daysSply)
 */
export function getNeedsReviewItems(items: ParsedItem[]): ParsedItem[] {
  return items.filter(
    i => i.confidence === 'low' || i.daysSply === null
  );
}

/**
 * Get all items (for the "All Items" tab)
 */
export function getAllItems(items: ParsedItem[]): ParsedItem[] {
  return items;
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
        watchCount: 0,
        reviewCount: 0,
      });
    }

    const group = vendorMap.get(item.vendorId)!;
    group.items.push(item);

    // Update counts based on confidence and daysSply
    if (item.confidence === 'low' || item.daysSply === null) {
      // LOW confidence = needs review
      group.reviewCount++;
    } else if (item.confidence === 'medium' && item.daysSply <= 5) {
      // MEDIUM confidence with low supply = watch list
      group.watchCount++;
    } else if (item.confidence === 'high') {
      // HIGH confidence
      if (item.daysSply <= 2) {
        group.criticalCount++;
        group.attentionCount++;
      } else if (item.daysSply <= 5) {
        group.attentionCount++;
      }
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
    'Avg': item.avg ?? '',
    'Avail': item.avail ?? '',
    'On Order': item.onOrder ?? '',
    'Days Sply': item.daysSply ?? '',
    'Lnd Cost': item.lndCst ?? '',
    'Slot': item.slot ?? '',
    'Confidence': item.confidence,
    'Notes': item.parseNotes.join('; '),
  }));
}

/**
 * Convert urgent POs to call list sheet data
 */
function urgentPOsToSheetData(pos: PurchaseOrder[]): object[] {
  return pos
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
    .map(po => ({
      'Vendor': po.vendorName,
      'Vendor ID': po.vendorId,
      'PO#': po.poNumber,
      'Due Date': po.dueDate,
      'Days Until Due': po.daysUntilDue,
      'Cases': po.totalCases,
      'EDI Confirmed': po.edi ? 'Yes' : 'NO',
      'Appointment': po.appointment || 'NONE',
      'Issues': po.urgentReasons.join(', '),
      'Status': po.status,
    }));
}

/**
 * Convert all POs to sheet data
 */
function posToSheetData(pos: PurchaseOrder[]): object[] {
  return pos.map(po => ({
    'PO#': po.poNumber,
    'Vendor': po.vendorName,
    'Vendor ID': po.vendorId,
    'Due Date': po.dueDate,
    'Days Until Due': po.daysUntilDue,
    'Cases': po.totalCases,
    'Status': po.status,
    'EDI': po.edi ? 'Yes' : po.edi === false ? 'No' : '-',
    'Appointment': po.appointment || '-',
    'Entered': po.entered || '-',
    'Urgent': po.isUrgent ? 'YES' : '',
    'Issues': po.urgentReasons.join(', '),
  }));
}

/**
 * Convert special orders to sheet data
 */
function specialOrdersToSheetData(orders: SpecialOrder[]): object[] {
  return orders.map(so => ({
    'Prod#': so.prodNo,
    'Description': so.description,
    'Customer #': so.custNo,
    'Customer Name': so.customerName,
    'Qty Ordered': so.qtyOrdered,
    'On Hand': so.onHand,
    'Status': so.status === '*DOQ*' ? 'On Order' : so.status,
    'PO#': so.poNumber || '-',
    'Date Entered': so.dateEntered,
    'Date DOQ': so.dateDoq || '-',
    'Date Due': so.dateDue || '-',
    'Vendor': so.vendorName,
    'Vendor ID': so.vendorId,
  }));
}

/**
 * Export to Excel with multiple sheets (including PO data)
 */
export function exportToExcel(
  items: ParsedItem[],
  filename: string = 'sues-buying-guide.xlsx',
  purchaseOrders: PurchaseOrder[] = [],
  specialOrders: SpecialOrder[] = []
): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: CALL LIST - Urgent POs (FIRST - most important!)
  const urgentPOs = purchaseOrders.filter(po => po.isUrgent);
  if (urgentPOs.length > 0) {
    const callListData = urgentPOsToSheetData(urgentPOs);
    const callListSheet = XLSX.utils.json_to_sheet(callListData);
    XLSX.utils.book_append_sheet(wb, callListSheet, 'CALL LIST');
  }

  // Sheet 2: Attention (HIGH confidence, ≤5 days)
  const attentionItems = getAttentionItems(items);
  const attentionData = itemsToSheetData(attentionItems);
  const attentionSheet = XLSX.utils.json_to_sheet(attentionData);
  XLSX.utils.book_append_sheet(wb, attentionSheet, 'Attention');

  // Sheet 3: Critical (HIGH confidence, ≤2 days)
  const criticalItems = getCriticalItems(items);
  const criticalData = itemsToSheetData(criticalItems);
  const criticalSheet = XLSX.utils.json_to_sheet(criticalData);
  XLSX.utils.book_append_sheet(wb, criticalSheet, 'Critical');

  // Sheet 4: Watch List (MEDIUM confidence, ≤5 days)
  const watchItems = getWatchListItems(items);
  const watchData = itemsToSheetData(watchItems);
  const watchSheet = XLSX.utils.json_to_sheet(watchData);
  XLSX.utils.book_append_sheet(wb, watchSheet, 'Watch List');

  // Sheet 5: All Purchase Orders
  if (purchaseOrders.length > 0) {
    const posData = posToSheetData(purchaseOrders);
    const posSheet = XLSX.utils.json_to_sheet(posData);
    XLSX.utils.book_append_sheet(wb, posSheet, 'All POs');
  }

  // Sheet 6: Special Orders
  if (specialOrders.length > 0) {
    const soData = specialOrdersToSheetData(specialOrders);
    const soSheet = XLSX.utils.json_to_sheet(soData);
    XLSX.utils.book_append_sheet(wb, soSheet, 'Special Orders');
  }

  // Sheet 7: Needs Review (LOW confidence)
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
 * Group POs by vendor name
 */
function groupPOsByVendor(pos: PurchaseOrder[]): Record<string, PurchaseOrder[]> {
  return pos.reduce((acc, po) => {
    if (!acc[po.vendorName]) {
      acc[po.vendorName] = [];
    }
    acc[po.vendorName].push(po);
    return acc;
  }, {} as Record<string, PurchaseOrder[]>);
}

/**
 * Generate email summary text (with PO data)
 */
export function generateEmailSummary(
  items: ParsedItem[],
  purchaseOrders: PurchaseOrder[] = [],
  specialOrders: SpecialOrder[] = [],
  poStats?: { totalPOs: number; totalCases: number; thisWeekArrivals: number; urgentPOCount: number }
): string {
  const attentionItems = getAttentionItems(items);
  const criticalItems = getCriticalItems(items);
  const watchItems = getWatchListItems(items);
  const reviewItems = getNeedsReviewItems(items);
  const groups = groupByVendor(attentionItems);

  const urgentPOs = purchaseOrders.filter(po => po.isUrgent);
  const urgentByVendor = groupPOsByVendor(urgentPOs);

  let summary = `SUE'S BUYING GUIDE - DAILY REPORT\n`;
  summary += `Generated: ${new Date().toLocaleString()}\n`;
  summary += `${'='.repeat(60)}\n\n`;

  // URGENT PO SECTION (if any)
  if (urgentPOs.length > 0) {
    const urgentCases = urgentPOs.reduce((sum, po) => sum + po.totalCases, 0);
    summary += `${'!'.repeat(60)}\n`;
    summary += `ACTION REQUIRED - CALL THESE VENDORS NOW\n`;
    summary += `${urgentPOs.length} POs missing EDI confirmation or appointment\n`;
    summary += `${urgentCases.toLocaleString()} cases at risk\n`;
    summary += `${'!'.repeat(60)}\n\n`;

    for (const [vendor, pos] of Object.entries(urgentByVendor)) {
      summary += `📞 ${vendor} (${pos[0].vendorId})\n`;
      for (const po of pos) {
        const urgency = po.daysUntilDue < 0 ? '⛔ OVERDUE' :
                        po.daysUntilDue === 0 ? '🔴 TODAY' :
                        `⚠️ ${po.daysUntilDue} days`;
        summary += `   PO# ${po.poNumber} | Due: ${po.dueDate} ${urgency} | ${po.totalCases.toLocaleString()} cases\n`;
        summary += `   Issues: ${po.urgentReasons.join(', ')}\n`;
      }
      summary += '\n';
    }
  } else {
    summary += `✅ No urgent POs requiring immediate attention\n\n`;
  }

  summary += `${'='.repeat(60)}\n`;
  summary += `INVENTORY SUMMARY\n`;
  summary += `${'-'.repeat(60)}\n`;
  summary += `  🔴 CRITICAL (≤2 days):     ${criticalItems.length} items\n`;
  summary += `  🟡 ATTENTION (≤5 days):    ${attentionItems.length} items\n`;
  summary += `  🟠 WATCH LIST (medium):    ${watchItems.length} items\n`;
  summary += `  ⚪ NEEDS REVIEW:           ${reviewItems.length} items\n\n`;

  if (poStats) {
    summary += `${'='.repeat(60)}\n`;
    summary += `PURCHASE ORDERS\n`;
    summary += `${'-'.repeat(60)}\n`;
    summary += `  📦 Open POs:        ${poStats.totalPOs}\n`;
    summary += `  📦 Total Cases:     ${poStats.totalCases.toLocaleString()}\n`;
    summary += `  📦 This Week:       ${poStats.thisWeekArrivals} arrivals\n`;
    summary += `  🚨 Urgent (call):   ${poStats.urgentPOCount}\n\n`;

    const readyCount = specialOrders.filter(so => so.status === 'Ready').length;
    const doqCount = specialOrders.filter(so => so.status === '*DOQ*').length;
    const pendingCount = specialOrders.filter(so => so.status === 'Order').length;

    summary += `  Special Orders:\n`;
    summary += `    ✅ Ready:         ${readyCount}\n`;
    summary += `    ⏳ On Order:      ${doqCount}\n`;
    summary += `    📝 Pending:       ${pendingCount}\n\n`;
  }

  summary += `${'='.repeat(60)}\n`;
  summary += `CRITICAL ITEMS BY VENDOR\n`;
  summary += `${'-'.repeat(60)}\n`;

  for (const group of groups) {
    const criticalInGroup = group.items.filter(i => i.daysSply !== null && i.daysSply <= 2);
    if (criticalInGroup.length === 0) continue;

    summary += `\n${group.vendorName}\n`;
    for (const item of criticalInGroup) {
      summary += `  • ${item.prodNo} - ${item.description}\n`;
      summary += `    Avail: ${item.avail ?? '?'} | On Order: ${item.onOrder ?? '-'} | Days: ${item.daysSply} ⚠️\n`;
    }
  }

  // Confirmed arrivals (next 10 non-urgent POs)
  const confirmedPOs = purchaseOrders
    .filter(po => !po.isUrgent && po.daysUntilDue >= 0)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
    .slice(0, 10);

  if (confirmedPOs.length > 0) {
    summary += `\n${'='.repeat(60)}\n`;
    summary += `CONFIRMED ARRIVALS (next 10)\n`;
    summary += `${'-'.repeat(60)}\n`;
    for (const po of confirmedPOs) {
      summary += `  ${po.dueDate}: PO# ${po.poNumber} - ${po.vendorName} (${po.totalCases.toLocaleString()} cases)\n`;
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

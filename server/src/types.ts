/**
 * Parsed item from Inventory Order Report
 */
export interface ParsedItem {
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

/**
 * Statistics from parsing
 */
export interface ParseStats {
  totalItems: number;
  highConfidenceCount: number;
  lowConfidenceCount: number;
  attentionCount: number;
  criticalCount: number;
  needsReviewCount: number;
  vendorCount: number;
}

/**
 * Purchase Order from Open P.O. Summary
 */
export interface PurchaseOrder {
  poNumber: string;           // 5-digit (e.g., "60649")
  vendorId: string;
  vendorName: string;
  dueDate: string;            // MM/DD/YY
  totalCases: number;
  status: string;             // "Conf:Recpt/Qty/Costs.", "Conf:EDI Costs", etc.
  edi: boolean | null;        // true = EDI confirmed, false/null = NOT confirmed
  appointment: string | null; // "01/02/26 06:00"
  pickUp: string | null;
  entered: string | null;     // Date entered

  // COMPUTED FIELDS (calculated after parsing)
  daysUntilDue: number;       // Days from report date to due date
  isUrgent: boolean;          // true if needs immediate attention
  urgentReasons: string[];    // ["No EDI confirmation", "No appointment"]
}

/**
 * Special Order (Customer Orders)
 */
export interface SpecialOrder {
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

/**
 * PO Statistics
 */
export interface POStats {
  totalPOs: number;
  totalCases: number;
  vendorsWithPOs: number;
  thisWeekArrivals: number;
  specialOrderCount: number;
  readyCount: number;
  doqCount: number;
  pendingCount: number;

  // URGENT PO STATS (for Action Required section)
  urgentPOCount: number;        // POs needing immediate attention
  urgentCases: number;          // Total cases at risk
  missingEDICount: number;      // POs without EDI confirmation
  missingAppointmentCount: number;  // POs without scheduled appointment
  overduePOCount: number;       // POs past due date
}

/**
 * Response from parse endpoint
 */
export interface ParseResponse {
  items: ParsedItem[];
  purchaseOrders: PurchaseOrder[];
  specialOrders: SpecialOrder[];
  stats: ParseStats;
  poStats: POStats;
  reportDate: string | null;    // Extracted from PDF header
  parseErrors: string[];
}

/**
 * Vendor tracking during parsing
 */
export interface CurrentVendor {
  id: string;
  name: string;
}

/**
 * Result of tail parsing (right-to-left)
 */
export interface TailParseResult {
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

/**
 * Result of front parsing (left-to-right)
 */
export interface FrontParseResult {
  prodNo: string;
  specialOrder: boolean;
  unit: string;
  size: string;
  brand: string;
  description: string;
  ytd: number | null;
}

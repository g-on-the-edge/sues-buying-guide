/**
 * Shared types between client and server
 */

export type Confidence = 'high' | 'medium' | 'low';

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

export interface ParseStats {
  totalItems: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  attentionCount: number;        // HIGH confidence, Sply <= 5
  attentionMediumCount: number;  // MEDIUM confidence, Sply <= 5 (Watch List)
  criticalCount: number;         // HIGH confidence, Sply <= 2
  needsReviewCount: number;
  specialOrderCount: number;
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

  // COMPUTED FIELDS
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

  // URGENT PO STATS
  urgentPOCount: number;
  urgentCases: number;
  missingEDICount: number;
  missingAppointmentCount: number;
  overduePOCount: number;
}

export interface ParseResponse {
  items: ParsedItem[];
  purchaseOrders: PurchaseOrder[];
  specialOrders: SpecialOrder[];
  stats: ParseStats;
  poStats: POStats;
  reportDate: string | null;
  parseErrors: string[];
}

export type TabType = 'attention' | 'critical' | 'watch' | 'review' | 'all' | 'pos' | 'calllist';

export interface VendorGroup {
  vendorId: string;
  vendorName: string;
  items: ParsedItem[];
  criticalCount: number;
  attentionCount: number;
  watchCount: number;  // MEDIUM confidence, Sply <= 5
  reviewCount: number;
}

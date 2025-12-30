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
 * Response from parse endpoint
 */
export interface ParseResponse {
  items: ParsedItem[];
  stats: ParseStats;
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

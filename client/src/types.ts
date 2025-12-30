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

export interface ParseResponse {
  items: ParsedItem[];
  stats: ParseStats;
  parseErrors: string[];
}

export type TabType = 'attention' | 'critical' | 'watch' | 'review' | 'all';

export interface VendorGroup {
  vendorId: string;
  vendorName: string;
  items: ParsedItem[];
  criticalCount: number;
  attentionCount: number;
  watchCount: number;  // MEDIUM confidence, Sply <= 5
  reviewCount: number;
}

/**
 * Shared types between client and server
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

export interface ParseStats {
  totalItems: number;
  highConfidenceCount: number;
  lowConfidenceCount: number;
  attentionCount: number;
  criticalCount: number;
  needsReviewCount: number;
  vendorCount: number;
}

export interface ParseResponse {
  items: ParsedItem[];
  stats: ParseStats;
  parseErrors: string[];
}

export type TabType = 'attention' | 'critical' | 'review' | 'all';

export interface VendorGroup {
  vendorId: string;
  vendorName: string;
  items: ParsedItem[];
  criticalCount: number;
  attentionCount: number;
  reviewCount: number;
}

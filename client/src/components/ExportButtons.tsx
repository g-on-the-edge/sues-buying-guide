import React, { useState } from 'react';
import { ParsedItem, TabType } from '../types';
import {
  exportToExcel,
  exportToCSV,
  generateEmailSummary,
  copyToClipboard,
  getAttentionItems,
  getCriticalItems,
  getNeedsReviewItems,
  getHighConfidenceItems,
} from '../utils/exportUtils';

interface ExportButtonsProps {
  items: ParsedItem[];
  activeTab: TabType;
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({ items, activeTab }) => {
  const [copied, setCopied] = useState(false);

  const getCurrentViewItems = (): ParsedItem[] => {
    switch (activeTab) {
      case 'attention':
        return getAttentionItems(items);
      case 'critical':
        return getCriticalItems(items);
      case 'review':
        return getNeedsReviewItems(items);
      case 'all':
      default:
        return getHighConfidenceItems(items);
    }
  };

  const handleExcelExport = () => {
    const timestamp = new Date().toISOString().slice(0, 10);
    exportToExcel(items, `sues-buying-guide-${timestamp}.xlsx`);
  };

  const handleCSVExport = () => {
    const timestamp = new Date().toISOString().slice(0, 10);
    const tabName = activeTab.replace(/[^a-z]/g, '-');
    exportToCSV(getCurrentViewItems(), `sues-buying-guide-${tabName}-${timestamp}.csv`);
  };

  const handleCopyEmail = async () => {
    const summary = generateEmailSummary(items);
    const success = await copyToClipboard(summary);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="export-buttons">
      <button
        className="btn btn-export"
        onClick={handleExcelExport}
        title="Export all categories to Excel with multiple sheets"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export Excel
      </button>

      <button
        className="btn btn-export"
        onClick={handleCSVExport}
        title="Export current view to CSV"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        Export CSV
      </button>

      <button
        className={`btn btn-export ${copied ? 'copied' : ''}`}
        onClick={handleCopyEmail}
        title="Copy email summary to clipboard"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {copied ? 'Copied!' : 'Copy Email Summary'}
      </button>

      <button
        className="btn btn-export"
        onClick={handlePrint}
        title="Print current view"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        Print
      </button>
    </div>
  );
};

import React from 'react';
import { POStats } from '../types';

interface POSummaryBannerProps {
  poStats: POStats;
  onClick: () => void;
}

export const POSummaryBanner: React.FC<POSummaryBannerProps> = ({ poStats, onClick }) => {
  if (poStats.totalPOs === 0) return null;

  return (
    <div className="po-summary-banner" onClick={onClick}>
      <div className="banner-left">
        <div className="banner-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="1" y="3" width="15" height="13" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
        </div>
        <span className="banner-title">Purchase Orders</span>
        <div className="banner-stats">
          <span>
            <strong>{poStats.totalPOs}</strong> Open POs
          </span>
          <span>
            <strong>{poStats.totalCases.toLocaleString()}</strong> Cases
          </span>
          <span>
            <strong>{poStats.thisWeekArrivals}</strong> This Week
          </span>
        </div>
      </div>
      <div className="banner-right">
        <span className="ready-count">Ready: {poStats.readyCount}</span>
        <span className="doq-count">On Order: {poStats.doqCount}</span>
        {poStats.pendingCount > 0 && (
          <span className="pending-count">Pending: {poStats.pendingCount}</span>
        )}
      </div>
    </div>
  );
};

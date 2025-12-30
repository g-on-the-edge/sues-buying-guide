import React from 'react';
import { PurchaseOrder } from '../types';

interface ActionRequiredBannerProps {
  urgentPOs: PurchaseOrder[];
  onViewDetails: () => void;
}

export const ActionRequiredBanner: React.FC<ActionRequiredBannerProps> = ({
  urgentPOs,
  onViewDetails,
}) => {
  if (urgentPOs.length === 0) return null;

  const totalCases = urgentPOs.reduce((sum, po) => sum + po.totalCases, 0);
  const overdue = urgentPOs.filter((po) => po.daysUntilDue < 0);
  const today = urgentPOs.filter((po) => po.daysUntilDue === 0);

  return (
    <div className="action-required-banner">
      <div className="banner-content">
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
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </div>
        <div className="banner-text">
          <h3 className="banner-title">
            ACTION REQUIRED: {urgentPOs.length} PO{urgentPOs.length !== 1 ? 's' : ''} Need Attention
          </h3>
          <p className="banner-subtitle">
            {totalCases.toLocaleString()} cases at risk
            {overdue.length > 0 && (
              <span className="overdue-badge"> {overdue.length} OVERDUE</span>
            )}
            {today.length > 0 && (
              <span className="today-badge"> {today.length} due TODAY</span>
            )}
            <span className="separator"> &bull; </span>
            Missing EDI confirmation or appointment - call vendors now
          </p>
        </div>
      </div>
      <button className="view-calllist-btn" onClick={onViewDetails}>
        View &amp; Call List
      </button>
    </div>
  );
};

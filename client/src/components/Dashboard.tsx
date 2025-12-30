import React from 'react';
import { ParseStats, TabType } from '../types';

interface DashboardProps {
  stats: ParseStats;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ stats, activeTab, onTabChange }) => {
  return (
    <div className="dashboard">
      <div className="stats-grid">
        <div
          className={`stat-card ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => onTabChange('all')}
        >
          <div className="stat-value">{stats.totalItems}</div>
          <div className="stat-label">Total Items</div>
          <div className="stat-detail">{stats.vendorCount} vendors</div>
        </div>

        <div
          className={`stat-card attention ${activeTab === 'attention' ? 'active' : ''}`}
          onClick={() => onTabChange('attention')}
        >
          <div className="stat-value">{stats.attentionCount}</div>
          <div className="stat-label">Attention</div>
          <div className="stat-detail">5 days or less</div>
        </div>

        <div
          className={`stat-card critical ${activeTab === 'critical' ? 'active' : ''}`}
          onClick={() => onTabChange('critical')}
        >
          <div className="stat-value">{stats.criticalCount}</div>
          <div className="stat-label">Critical</div>
          <div className="stat-detail">2 days or less</div>
        </div>

        <div
          className={`stat-card review ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => onTabChange('review')}
        >
          <div className="stat-value">{stats.needsReviewCount}</div>
          <div className="stat-label">Needs Review</div>
          <div className="stat-detail">Low confidence</div>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'attention' ? 'active' : ''}`}
          onClick={() => onTabChange('attention')}
        >
          Attention ({stats.attentionCount})
        </button>
        <button
          className={`tab ${activeTab === 'critical' ? 'active' : ''}`}
          onClick={() => onTabChange('critical')}
        >
          Critical ({stats.criticalCount})
        </button>
        <button
          className={`tab ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => onTabChange('review')}
        >
          Needs Review ({stats.needsReviewCount})
        </button>
        <button
          className={`tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => onTabChange('all')}
        >
          All High-Confidence ({stats.highConfidenceCount})
        </button>
      </div>
    </div>
  );
};

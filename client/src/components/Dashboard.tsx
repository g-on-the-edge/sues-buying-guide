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
          <div className="stat-detail">HIGH conf, ≤5 days</div>
        </div>

        <div
          className={`stat-card critical ${activeTab === 'critical' ? 'active' : ''}`}
          onClick={() => onTabChange('critical')}
        >
          <div className="stat-value">{stats.criticalCount}</div>
          <div className="stat-label">Critical</div>
          <div className="stat-detail">HIGH conf, ≤2 days</div>
        </div>

        <div
          className={`stat-card watch ${activeTab === 'watch' ? 'active' : ''}`}
          onClick={() => onTabChange('watch')}
        >
          <div className="stat-value">{stats.attentionMediumCount}</div>
          <div className="stat-label">Watch List</div>
          <div className="stat-detail">MED conf, ≤5 days</div>
        </div>

        <div
          className={`stat-card review ${activeTab === 'review' ? 'active' : ''}`}
          onClick={() => onTabChange('review')}
        >
          <div className="stat-value">{stats.needsReviewCount}</div>
          <div className="stat-label">Needs Review</div>
          <div className="stat-detail">LOW confidence</div>
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
          className={`tab ${activeTab === 'watch' ? 'active' : ''}`}
          onClick={() => onTabChange('watch')}
        >
          Watch List ({stats.attentionMediumCount})
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
          All Items ({stats.totalItems})
        </button>
      </div>
    </div>
  );
};

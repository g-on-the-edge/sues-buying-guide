import { useMemo, useState } from 'react';
import { ParsedItem, TabType } from '../types';
import { VendorGroup } from './VendorGroup';
import {
  getAttentionItems,
  getCriticalItems,
  getWatchListItems,
  getNeedsReviewItems,
  getAllItems,
  groupByVendor,
} from '../utils/exportUtils';

interface ItemTableProps {
  items: ParsedItem[];
  activeTab: TabType;
}

export const ItemTable: React.FC<ItemTableProps> = ({ items, activeTab }) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter items based on active tab
  const filteredItems = useMemo(() => {
    let result: ParsedItem[];

    switch (activeTab) {
      case 'attention':
        result = getAttentionItems(items);
        break;
      case 'critical':
        result = getCriticalItems(items);
        break;
      case 'watch':
        result = getWatchListItems(items);
        break;
      case 'review':
        result = getNeedsReviewItems(items);
        break;
      case 'all':
      default:
        result = getAllItems(items);
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      result = result.filter(item =>
        item.prodNo.toLowerCase().includes(search) ||
        item.brand.toLowerCase().includes(search) ||
        item.description.toLowerCase().includes(search) ||
        item.vendorName.toLowerCase().includes(search)
      );
    }

    return result;
  }, [items, activeTab, searchTerm]);

  // Group by vendor
  const vendorGroups = useMemo(() => {
    return groupByVendor(filteredItems);
  }, [filteredItems]);

  const getTabDescription = () => {
    switch (activeTab) {
      case 'attention':
        return 'HIGH confidence items with 5 days or less supply';
      case 'critical':
        return 'HIGH confidence items with 2 days or less supply - IMMEDIATE ACTION REQUIRED';
      case 'watch':
        return 'MEDIUM confidence items with 5 days or less supply - verify data before acting';
      case 'review':
        return 'LOW confidence items - manual review recommended';
      case 'all':
        return 'All parsed items';
    }
  };

  return (
    <div className="item-table-container">
      <div className="table-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by Prod#, Brand, Description, or Vendor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {searchTerm && (
            <button
              className="search-clear"
              onClick={() => setSearchTerm('')}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <div className="results-count">
          Showing {filteredItems.length} items from {vendorGroups.length} vendors
        </div>
      </div>

      <div className="tab-description">
        {getTabDescription()}
      </div>

      {vendorGroups.length === 0 ? (
        <div className="no-results">
          {searchTerm ? (
            <p>No items match your search "{searchTerm}"</p>
          ) : (
            <p>No items in this category</p>
          )}
        </div>
      ) : (
        <div className="vendor-groups">
          {vendorGroups.map((group) => (
            <VendorGroup
              key={group.vendorId}
              group={group}
              showConfidenceBadge={activeTab === 'watch' || activeTab === 'review' || activeTab === 'all'}
            />
          ))}
        </div>
      )}
    </div>
  );
};

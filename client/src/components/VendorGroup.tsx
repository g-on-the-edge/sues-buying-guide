import React, { useState } from 'react';
import { VendorGroup as VendorGroupType, ParsedItem } from '../types';

interface VendorGroupProps {
  group: VendorGroupType;
  showReviewBadge?: boolean;
}

interface ItemRowProps {
  item: ParsedItem;
}

const ItemRow: React.FC<ItemRowProps> = ({ item }) => {
  const [showNotes, setShowNotes] = useState(false);

  const getRowClass = () => {
    if (item.confidence === 'low' || item.daysSply === null) {
      return 'row-review';
    }
    if (item.daysSply <= 2) {
      return 'row-critical';
    }
    if (item.daysSply <= 5) {
      return 'row-attention';
    }
    return '';
  };

  const formatNumber = (val: number | null) => {
    if (val === null) return '-';
    return val.toLocaleString();
  };

  const formatCurrency = (val: number | null) => {
    if (val === null) return '-';
    return `$${val.toFixed(2)}`;
  };

  return (
    <>
      <tr className={getRowClass()}>
        <td className="col-prodno">
          {item.prodNo}
          {item.specialOrder && <span className="badge-so">S/O</span>}
        </td>
        <td className="col-brand">{item.brand}</td>
        <td className="col-description">{item.description}</td>
        <td className="col-size">{item.size}</td>
        <td className="col-number">{formatNumber(item.avail)}</td>
        <td className="col-number">{formatNumber(item.onOrder)}</td>
        <td className="col-days">
          {item.daysSply !== null ? (
            <span className={`days-value ${item.daysSply <= 2 ? 'critical' : item.daysSply <= 5 ? 'attention' : ''}`}>
              {item.daysSply}
            </span>
          ) : (
            <span className="days-unknown">?</span>
          )}
        </td>
        <td className="col-currency">{formatCurrency(item.lndCst)}</td>
        <td className="col-currency">{formatCurrency(item.mrkCst)}</td>
        <td className="col-slot">{item.slot || '-'}</td>
        <td className="col-ip">{item.ip !== null ? item.ip.toFixed(1) : '-'}</td>
        <td className="col-confidence">
          {item.confidence === 'low' ? (
            <button
              className="btn-notes"
              onClick={() => setShowNotes(!showNotes)}
              title={item.parseNotes.join('\n')}
            >
              Review
            </button>
          ) : (
            <span className="confidence-high">OK</span>
          )}
        </td>
      </tr>
      {showNotes && item.parseNotes.length > 0 && (
        <tr className="row-notes">
          <td colSpan={12}>
            <div className="notes-content">
              <strong>Parse Notes:</strong>
              <ul>
                {item.parseNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
              <div className="raw-line">
                <strong>Raw Line:</strong> <code>{item.rawLine}</code>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export const VendorGroup: React.FC<VendorGroupProps> = ({ group, showReviewBadge }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasIssues = group.criticalCount > 0 || group.reviewCount > 0;

  return (
    <div className={`vendor-group ${hasIssues ? 'has-issues' : ''}`}>
      <div
        className="vendor-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="vendor-title">
          <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
            {isExpanded ? '▼' : '▶'}
          </span>
          <span className="vendor-name">{group.vendorName}</span>
          <span className="vendor-id">({group.vendorId})</span>
        </div>
        <div className="vendor-badges">
          {group.criticalCount > 0 && (
            <span className="badge badge-critical">{group.criticalCount} critical</span>
          )}
          {group.attentionCount > group.criticalCount && (
            <span className="badge badge-attention">
              {group.attentionCount - group.criticalCount} attention
            </span>
          )}
          {showReviewBadge && group.reviewCount > 0 && (
            <span className="badge badge-review">{group.reviewCount} review</span>
          )}
          <span className="badge badge-total">{group.items.length} items</span>
        </div>
      </div>

      {isExpanded && (
        <div className="vendor-items">
          <table className="items-table">
            <thead>
              <tr>
                <th className="col-prodno">Prod#</th>
                <th className="col-brand">Brand</th>
                <th className="col-description">Description</th>
                <th className="col-size">Size</th>
                <th className="col-number">Avail</th>
                <th className="col-number">On Order</th>
                <th className="col-days">Days Sply</th>
                <th className="col-currency">Lnd Cost</th>
                <th className="col-currency">Mrk Cost</th>
                <th className="col-slot">Slot</th>
                <th className="col-ip">IP</th>
                <th className="col-confidence">Status</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((item, idx) => (
                <ItemRow key={`${item.prodNo}-${idx}`} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { VendorGroup as VendorGroupType, ParsedItem, Confidence } from '../types';

interface VendorGroupProps {
  group: VendorGroupType;
  showConfidenceBadge?: boolean;
}

interface ItemRowProps {
  item: ParsedItem;
}

// Confidence badge component per spec
const ConfidenceBadge: React.FC<{ confidence: Confidence; onClick?: () => void }> = ({ confidence, onClick }) => {
  const styles: Record<Confidence, string> = {
    high: 'confidence-badge confidence-high',
    medium: 'confidence-badge confidence-medium',
    low: 'confidence-badge confidence-low',
  };

  const labels: Record<Confidence, string> = {
    high: 'HIGH',
    medium: 'MED',
    low: 'LOW',
  };

  if (onClick) {
    return (
      <button type="button" className={styles[confidence]} onClick={onClick}>
        {labels[confidence]}
      </button>
    );
  }

  return <span className={styles[confidence]}>{labels[confidence]}</span>;
};

const ItemRow: React.FC<ItemRowProps> = ({ item }) => {
  const [showNotes, setShowNotes] = useState(false);

  const getRowClass = () => {
    // LOW confidence = needs review (gray)
    if (item.confidence === 'low' || item.daysSply === null) {
      return 'row-review';
    }
    // MEDIUM confidence with low supply = watch (light orange)
    if (item.confidence === 'medium' && item.daysSply !== null && item.daysSply <= 5) {
      return 'row-watch';
    }
    // HIGH confidence with critical supply (red)
    if (item.confidence === 'high' && item.daysSply !== null && item.daysSply <= 2) {
      return 'row-critical';
    }
    // HIGH confidence with attention supply (yellow)
    if (item.confidence === 'high' && item.daysSply !== null && item.daysSply <= 5) {
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
        <td className="col-number">{formatNumber(item.avg)}</td>
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
        <td className="col-slot">{item.slot || '-'}</td>
        <td className="col-confidence">
          {item.confidence === 'low' || item.confidence === 'medium' ? (
            <ConfidenceBadge
              confidence={item.confidence}
              onClick={() => setShowNotes(!showNotes)}
            />
          ) : (
            <ConfidenceBadge confidence={item.confidence} />
          )}
        </td>
      </tr>
      {showNotes && (item.parseNotes.length > 0 || item.confidence !== 'high') && (
        <tr className="row-notes">
          <td colSpan={11}>
            <div className="notes-content">
              <strong>Parse Notes:</strong>
              <ul>
                {item.parseNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
                <li>Numeric columns found: {item.numericColumns}</li>
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

export const VendorGroup: React.FC<VendorGroupProps> = ({ group, showConfidenceBadge }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasIssues = group.criticalCount > 0 || group.watchCount > 0 || group.reviewCount > 0;

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
          {showConfidenceBadge && group.watchCount > 0 && (
            <span className="badge badge-watch">{group.watchCount} watch</span>
          )}
          {showConfidenceBadge && group.reviewCount > 0 && (
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
                <th className="col-number">Avg</th>
                <th className="col-number">Avail</th>
                <th className="col-number">On Order</th>
                <th className="col-days">Days Sply</th>
                <th className="col-currency">Lnd Cost</th>
                <th className="col-slot">Slot</th>
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

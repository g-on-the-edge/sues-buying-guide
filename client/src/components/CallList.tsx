import React from 'react';
import { PurchaseOrder } from '../types';

interface CallListProps {
  urgentPOs: PurchaseOrder[];
  onClose?: () => void;
}

// Group POs by vendor
function groupByVendor(pos: PurchaseOrder[]): Record<string, PurchaseOrder[]> {
  return pos.reduce(
    (acc, po) => {
      const key = po.vendorName;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(po);
      return acc;
    },
    {} as Record<string, PurchaseOrder[]>
  );
}

function getUrgencyBadge(daysUntilDue: number): { text: string; className: string } {
  if (daysUntilDue < 0) {
    return {
      text: `${Math.abs(daysUntilDue)} DAY${Math.abs(daysUntilDue) !== 1 ? 'S' : ''} OVERDUE`,
      className: 'urgency-overdue',
    };
  }
  if (daysUntilDue === 0) {
    return { text: 'DUE TODAY', className: 'urgency-today' };
  }
  return {
    text: `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`,
    className: 'urgency-soon',
  };
}

export const CallList: React.FC<CallListProps> = ({ urgentPOs, onClose }) => {
  // Sort by days until due (overdue first)
  const sorted = [...urgentPOs].sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  const byVendor = groupByVendor(sorted);

  if (urgentPOs.length === 0) {
    return (
      <div className="call-list empty">
        <p>No urgent POs requiring attention.</p>
      </div>
    );
  }

  return (
    <div className="call-list">
      <div className="call-list-header">
        <div className="header-icon">
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
        <h2>Call List - Vendors to Contact</h2>
        {onClose && (
          <button className="close-btn" onClick={onClose}>
            &times;
          </button>
        )}
      </div>

      <div className="vendor-groups">
        {Object.entries(byVendor).map(([vendorName, pos]) => {
          const totalCases = pos.reduce((sum, po) => sum + po.totalCases, 0);
          const mostUrgent = pos[0]; // Already sorted
          const urgency = getUrgencyBadge(mostUrgent.daysUntilDue);

          return (
            <div key={vendorName} className="vendor-call-group">
              <div className="vendor-header">
                <div className="vendor-info">
                  <h3>{vendorName}</h3>
                  <p className="vendor-id">Vendor ID: {pos[0].vendorId}</p>
                </div>
                <div className="vendor-urgency">
                  <span className={`urgency-badge ${urgency.className}`}>{urgency.text}</span>
                </div>
              </div>

              <table className="po-table">
                <thead>
                  <tr>
                    <th>PO#</th>
                    <th>Due Date</th>
                    <th className="text-right">Cases</th>
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {pos.map((po) => (
                    <tr key={po.poNumber}>
                      <td className="po-number">{po.poNumber}</td>
                      <td>{po.dueDate}</td>
                      <td className="text-right">{po.totalCases.toLocaleString()}</td>
                      <td className="issues">
                        {po.urgentReasons.map((reason) => (
                          <span key={reason} className="issue-badge">
                            {reason}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="vendor-summary">
                <strong>Total:</strong> {pos.length} PO{pos.length !== 1 ? 's' : ''},{' '}
                {totalCases.toLocaleString()} cases
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


import styles from './Panels.module.css';
import { getCurrencySymbol } from '../utils/currency';

export default function PaymentsPanel({ payments, group, refreshKey }) {
    const symbol = getCurrencySymbol(group?.currency || 'USD');

    return (
        <div style={{ padding: 20 }}>
            {payments === null ? (
                <div style={{ textAlign: 'center', padding: 12 }}>
                    <div className="spinner" role="status" aria-label="Loading" />
                </div>
            ) : payments.length === 0 ? (
                <p style={{ textAlign: 'center' }}>No Payments yet.</p>
            ) : (
                <div>
                    {payments.map(p => (
                        <div className={styles.panelItem} key={p._id} data-expense-id={p._id} refreshKey={refreshKey}>
                            <div>
                                <span className={styles.itemStripe} />
                                <strong>{p.paidBy?.name} → {p.paidTo?.name}</strong>
                                <p>{String(p.createdAt).slice(0, 10)}</p>
                            </div>
                            <div>
                                <strong>{symbol}{p.amount.toFixed(2)}</strong>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
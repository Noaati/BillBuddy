
import styles from './Panels.module.css';
import { useState, Fragment } from 'react';
import { getCurrencySymbol } from '../utils/currency';
import { auth } from '../lib/firebase';
import checkMark from '../assets/GreenCheckMark.png';

export default function ExpensesPanel({ expenses, group, refreshKey }) {
    const symbol = getCurrencySymbol(group?.currency || 'USD');
    const [openIds, setOpenIds] = useState(() => new Set());
    const [sharesByExpense, setSharesByExpense] = useState({});

    async function handleOpenExpenseDetails(e) {
        e.preventDefault();
        const expenseId = e.currentTarget.getAttribute('data-expense-id');
        if (!expenseId || expenseId === 'null') return;

        if (openIds.has(expenseId)) {
            setOpenIds(prev => {
            const next = new Set(prev);
            next.delete(expenseId);
            return next;
            });
            return;
        }

        setOpenIds(prev => {
            const next = new Set(prev);
            next.add(expenseId);
            return next;
        });

        if (!sharesByExpense[expenseId]) {
            const idToken = await auth.currentUser?.getIdToken();
            const res = await fetch(`http://localhost:5000/api/expenses/${expenseId}/shares`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${idToken}` },
            });
            const payload = await res.json();
            const shares = Array.isArray(payload) ? payload : (payload.docs || payload.shares || []);
            setSharesByExpense(prev => ({ ...prev, [expenseId]: shares }));
        }

    }

    return (
        <div style={{ padding: 20 }}>
            {expenses === null ? (
                <div style={{ textAlign: 'center', padding: 12 }}>
                    <div className="spinner" role="status" aria-label="Loading" />
                </div>
            ) : expenses.length === 0 ? (
                <p style={{ textAlign: 'center' }}>No expenses yet.</p>
            ) : (
                <div>
                    {expenses.map(expense => (
                        <Fragment key={expense._id}>
                            <div className={styles.panelItem} key={expense._id} data-expense-id={expense._id} refreshKey={refreshKey} onClick={handleOpenExpenseDetails}>
                                <div>
                                    <span className={styles.itemStripe} />
                                    <strong>{expense.description}</strong>
                                    <p>Paid by {expense.paidBy?.name} • {String(expense.createdAt).slice(0, 10)}</p>
                                </div>
                                <div className={styles.checkMarkAndAmount}>
                                    {expense.settled && (
                                        <div className={styles.allSettled}>
                                            <img src={checkMark} alt="check" className={styles.checkMarkIcon} />
                                            All Settled
                                        </div>
                                    )}
                                    <strong>{symbol}{expense.amount.toFixed(2)}</strong>
                                </div>
                                </div>
                                {openIds.has(expense._id) && (
                                    <div className={styles.expenseDetails}>
                                    <div className={styles.expenseDetailsTitle}>Expense Share Details</div>
                                    {(sharesByExpense[expense._id]?.length ?? 0) > 0 ? (
                                        <div className={styles.expenseDetailsList}>
                                        {sharesByExpense[expense._id].map((s) => (
                                            <div className={styles.expenseShareItem} key={s._id || s.owes}>
                                                <div>
                                                    <span className={styles.shareItemDot}>•</span>
                                                    <span>{s.owes?.name || s.owesName || 'Member'}</span>
                                                </div>
                                                <div>
                                                    <span className={styles.shareAmount}>{'Share: '}{symbol}{Number(s.amount || 0).toFixed(2)}</span>
                                                    {(() => {
                                                        const amount = Number(s.amount) || 0;
                                                        const paid   = Number(s.paid)   || 0;
                                                        const left   = Math.max(0, Math.round((amount - paid) * 100) / 100); // כמה נשאר לשלם
                                                        const label  = left > 0 ? 'Owes' : 'Paid';
                                                        const value  = left > 0 ? left    : paid;
                                                        return <span style={{ color: left > 0 ? 'red' : 'green' }}>{label}: {symbol}{value.toFixed(2)}</span>;
                                                    })()}
                                                </div>
                                            </div>
                                        ))}
                                        </div>
                                    ) : (
                                        <div></div>
                                    )}
                                </div>
                                )}
                        </Fragment>
                    ))}
                </div>
            )}
        </div>
    );
}
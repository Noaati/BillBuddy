import { useState, useEffect, useMemo } from 'react';
import { auth } from '../lib/firebase';
import styles from './AddPayment.module.css';
import { getCurrencySymbol } from '../utils/currency';
import { toast } from 'react-hot-toast';

export default function AddPayment({ group, onSuccess = () => {}, initialPayeeId = null }) {
    const symbol = getCurrencySymbol(group?.currency || 'USD');
    const [payees, setPayees] = useState(null);
    const [selectedPayeeId, setSelectedPayeeId] = useState('');
    const selectedPayee = Array.isArray(payees) ? (payees.find(p => String(p.payeeId) === String(selectedPayeeId)) || null): null;
    const [mode, setMode] = useState('member');
    const [selectedShareIds, setSelectedShareIds] = useState(() => new Set());
    const [customAmount, setCustomAmount] = useState('');
    const [totalLeft, setTotalLeft] = useState(null);

    const totalShares = selectedPayee?.shares?.length ?? 0;
    const noneSelected = selectedShareIds.size === 0;
    const allSelected  = totalShares > 0 && selectedShareIds.size === totalShares;
    const atLeastOneSelected = selectedShareIds.size > 0;

    useEffect(() => {
        (async () => {
            const idToken = await auth.currentUser?.getIdToken();
            const res = await fetch(`${window.API_BASE}/groups/${group.id}/payees`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${idToken}` },
            });
            const payload = await res.json();
            const list = payload.payees ?? [];
            setPayees(payload.payees ?? []);
            console.log('payees data:', payload.payees);
            if (initialPayeeId) {
                const p = list.find(x => String(x.payeeId) === String(initialPayeeId));
                if (p) {
                setSelectedPayeeId(p.payeeId);
                setTotalLeft(p.totalLeft);
                setSelectedShareIds(new Set());
                setMode('shares');
                }
            } 
        })();
    }, [group?.id]);

    function handleSelectAll() {
        if (!selectedPayee) return 0;
        setSelectedShareIds(new Set(selectedPayee.shares.map(s => s.shareId)));
    }

    function handleClearAll() {
        setSelectedShareIds(new Set());
    }

    const totalSelected = useMemo(() => {
        if (!selectedPayee) return 0;
        const selectedShares = (selectedPayee?.shares ?? []).filter(s =>
        selectedShareIds.has(s.shareId)
        );
        return selectedShares.reduce(
        (sum, s) => sum + (Number(s.leftToPay) || 0),
        0
        );
    }, [selectedShareIds, selectedPayee]);

    const paymentAmount = customAmount? customAmount : totalSelected;
    const paymentAmountGreaterThanTotalLeft = paymentAmount > totalLeft;

    async function handleAddPayment(){
        try{
            const idToken = await auth.currentUser?.getIdToken();
            const body = {
                payeeId: selectedPayeeId,
                totalAmount: Number(paymentAmount),
                ...(atLeastOneSelected ? { shareIds: Array.from(selectedShareIds) } : {})
            };
            const res = await fetch(`${window.API_BASE}/groups/${group?.id}/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) { console.error('payment failed:', data); return; }
            onSuccess?.(data);
            toast.success(`Payment completed successfully`);
        }
        catch (e){
            console.error('error: ', e);
        }
    }

    return (
        <div>
            {mode == 'member' && (
                <div>
                    {payees === null ? (
                        <div style={{ textAlign: 'center', padding: 12 }}>
                            <div className="spinner" />
                        </div>
                    ) : payees.length === 0 ? (
                        <div className={styles.emptyState}>
                            You’re all settled!
                        </div>
                        ) : (
                    <>
                    <span>Choose the group member you want to record a payment to:</span>
                    <div className={styles.payeesList}>
                    {payees.map((p) => {
                        const count = p.shares?.length ?? 0;

                        return (
                        <button
                            key={p.payeeId}
                            type="button"
                            className={styles.payeeItem}
                            onClick={() => { 
                                setSelectedPayeeId(p.payeeId); 
                                setMode('shares');
                                setTotalLeft(p.totalLeft);
                                setSelectedPayeeId(p.payeeId);
                                setSelectedShareIds(new Set());
                            }}
                        >
                            <span className={styles.itemStripe} />

                            <div className={styles.leftSide}>
                                <div className={styles.title}>{p.name}</div>
                                <div className={styles.subtitle}>
                                    {count} unpaid expense{count === 1 ? '' : 's'}
                                </div>
                            </div>

                            <div className={styles.rightSide}>
                                <div className={styles.amountOwed}>
                                    {symbol}{Number(p.totalLeft || 0).toFixed(2)}
                                </div>
                                <div className={styles.amountLabel}>Total owed</div>
                            </div>
                        </button>
                        );
                    })}
                    </div>
                    </>
                    )}
                </div>
            )}
            {mode == 'shares' && (
                <div>
                    <div className={styles.sharesHeader}>
                        <span>Select expenses to include in this payment:</span>
                        <div>
                            <button className={styles.selectAllButton} onClick={handleSelectAll} disabled={allSelected}>Select All</button>
                            <button className={styles.selectAllButton} onClick={handleClearAll} disabled={noneSelected}>Clear All</button>
                        </div>
                    </div>

                    <div className={styles.payeesList}>
                    {selectedPayee.shares.map((s) => {
                        return (
                        <div key={s.shareId} className={styles.shareItem}>
                            <div className={styles.includeCheckbox}>
                                <input
                                    type="checkbox"
                                    checked={selectedShareIds.has(s.shareId)}
                                    disabled={customAmount}
                                    onChange={(e) => {
                                        setSelectedShareIds(prev => {
                                            const next = new Set(prev);
                                            if (e.target.checked) next.add(s.shareId);
                                            else next.delete(s.shareId);
                                            return next;
                                        });
                                }}
                                />
                                
                                <div className={styles.leftSide}>
                                    <div className={styles.title}>{s.description || '-'}</div>
                                    <div className={styles.subtitle}>
                                    {String(s.date).slice(0, 10)}
                                    </div>
                                </div>
                            </div>
                            <div className={styles.rightSide}>
                                <div className={styles.amountOwed}>
                                    {symbol}{s.leftToPay.toFixed(2)}
                                </div>
                            </div>
                        </div>
                        );
                    })}
                    </div>
                    <div className={`divider ${styles.paymentDivider}`}></div>
                    <div className={`${styles.totalSection} ${customAmount ? styles.muted : ''}`}>
                        <p>Selected Total:</p>
                        <p>{symbol}{totalSelected}</p>
                    </div>
                    <div className={styles.customAmount}>
                        <label className={styles.customAmountLabel} htmlFor="customAmount">Custom Amount (Optional)</label>
                        <input id="customAmount" type="number" disabled={atLeastOneSelected} placeholder="Enter custom amount..." onChange={(e) => setCustomAmount(e.target.value)} />
                        <p style={{ fontSize: 11, color: 'grey', marginTop: 0 }}>Leave empty to use selected total</p>
                        {paymentAmountGreaterThanTotalLeft && (
                            <span style={{fontSize: 12, color: 'red'}}>{symbol}{paymentAmount} exceeds the total owed ({symbol}{totalLeft})</span>
                        )}
                    </div>
                    <div className={`divider ${styles.paymentDivider}`}></div>
                    <div className={styles.paymentSection}>
                        <p>Payment Amount: {symbol}{paymentAmount}</p>
                        <button className="button" disabled={!paymentAmount || paymentAmountGreaterThanTotalLeft} onClick={handleAddPayment}>Add Payment</button>
                    </div>
                </div>
            )}
        </div>
    );
}
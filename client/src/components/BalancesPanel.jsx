
import styles from './Panels.module.css';
import { getCurrencySymbol } from '../utils/currency';
import useAccount from "../hooks/useAccount";
import { auth } from '../lib/firebase';
import { toast } from 'react-hot-toast';
import { useState } from "react";

export default function BalancesPanel({ balances, group, refreshKey, onPayNow }) {
    const symbol = getCurrencySymbol(group?.currency || 'USD');
    const youOwe = balances?.youOwe || [];
    const others = balances?.othersOweYou || [];
    const totals = balances?.totals || { youOwe: 0, owedToYou: 0 };
    const allBalanced = totals.youOwe == 0 && totals.owedToYou == 0;
    const { account } = useAccount();
    const [loadReminder, setLoadReminder] = useState(false);

    async function handleRemind(o) {
        setLoadReminder(true);
        const subject = `Reminder: you owe ${account?.firstName} ${symbol}${o.totalLeft.toFixed(2)}`;
        const text = `Hi ${o.name},\n\nAccording to BillBuddy you owe ${account?.firstName} ${symbol}${o.totalLeft.toFixed(2)}.\nCan you settle it?\n\n`;
        console.log('o: ', o);
        try{
            const idToken = await auth.currentUser?.getIdToken();
            const res = await fetch('http://localhost:5000/api/email/remind', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ to: o.email, subject, text })
            });
            if (res.ok) {
                setLoadReminder(false);
                toast.success(`Reminder sent to ${o.name}`);
            }
            else {
                const raw = await res.text();
                let body = raw ? JSON.parse(raw): null;
                console.error('Remind email failed:', body);
            }
        }
        catch (e) {
            console.error('Remind email error:', e);
        }
    }



    return (
        <div style={{ padding: 20 }}>
            {balances === null ? (
                <div style={{ textAlign: 'center', padding: 12 }}>
                    <div className="spinner" role="status" aria-label="Loading" />
                </div>
            ) : allBalanced ? (
                <p style={{ textAlign: 'center' }}>You’re all settled.</p>
            ) : (
                <div>
                    <div>
                        <span style={{ color: 'red', fontSize: 20, fontWeight: 'bold' }}>•</span> You Owe
                        {youOwe.length === 0 ? (
                        <p style={{ margin: '8px 0 0 24px', color: '#666' }}>You don’t owe anyone right now.</p>
                        ) : (
                        <>
                            {youOwe.map(yo => (
                            <div className={styles.panelItem} key={yo._id} data-expense-id={yo._id} refreshKey={refreshKey}>
                                <div>
                                    <span className={styles.itemStripe} />
                                    <strong>{yo.name}</strong>
                                </div>
                                <div className={styles.amountAndPayButton}>
                                    <strong style={{ textAlign: 'center' }}>{symbol}{yo.totalLeft.toFixed(2)}</strong>
                                    <button className={`${styles.payNow} button`} onClick={() => onPayNow?.(yo.memberId)}>Pay Now</button>
                                </div>
                            </div>
                            ))}
                            <div className={styles.total}>
                                <p>Total you owe:</p>
                                <p>{symbol}{Number(totals.youOwe || 0).toFixed(2)}</p>
                            </div>
                        </>
                        )}

                        
                    </div>
                    <div className="divider"></div>
                    <div>
                        <span style={{ color: 'green', fontSize: 20, fontWeight: 'bold' }}>•</span> Others Owe You
                        {others.length === 0 ? (
                        <p style={{ margin: '8px 0 0 24px', color: '#666' }}>No one owes you right now.</p>
                        ) : (
                        <>
                            {others.map(o => (
                            <div className={styles.panelItem} key={o._id} data-expense-id={o._id} refreshKey={refreshKey}>
                                <div>
                                    <span className={styles.itemStripe} />
                                    <strong>{o.name}</strong>
                                </div>
                                <div className={styles.amountAndPayButton}>
                                    <strong>{symbol}{o.totalLeft.toFixed(2)}</strong>
                                    {loadReminder ? (
                                        <div style={{ textAlign: 'center', padding: 12 }}>
                                            <div className="spinner" role="status" aria-label="Loading" />
                                        </div>
                                    ): (
                                        <button className={`${styles.payNow} button`} onClick={() => handleRemind(o)}>Remind</button>
                                    )}
                                </div>
                            </div>
                            ))}
                            <div className={styles.total}>
                                <p>Total owed to you:</p>
                                <p>{symbol}{Number(totals.owedToYou || 0).toFixed(2)}</p>
                            </div>
                        </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
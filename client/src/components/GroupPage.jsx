
import groupicon from '../assets/groupIcon.png';
import styles from './GroupPage.module.css';
import { useState, useEffect } from 'react';
import { auth } from '../lib/firebase';
import ExpensesPanel from './ExpensesPanel';
import PaymentsPanel from './PaymentsPanel';
import BalancesPanel from './BalancesPanel';
import { getCurrencySymbol } from '../utils/currency';
import { Toaster } from 'react-hot-toast';

export default function GroupPage({ group, onAddExpense = () => {}, refreshKey, onAddPayment = () => {}, onPayNow = () => {}, panel }) {
    const [mode, setMode] = useState(panel ?? 'Expenses');
    const [expenses, setExpenses] = useState(null);
    const avatarSrc = group?.image || groupicon;
    const [payments, setPayments] = useState(null);
    const [balances, setBalances] = useState(null);
    const symbol = getCurrencySymbol(group?.currency || 'USD');

    useEffect(() => {
        if (panel && panel !== mode) setMode(panel);
    }, [panel]);

    useEffect(() => {
        (async () => {
            const idToken = await auth.currentUser?.getIdToken();
            if(mode === 'Expenses') {
                const res = await fetch(`http://localhost:5000/api/expenses/${group?.id}`, {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                });
                const data = await res.json();
                console.log('Expenses data:', data);
                setExpenses(data?.expenses || []);
            }
            if(mode === 'Payments'){
                const pres = await fetch(`http://localhost:5000/api/payments/${group?.id}`, {
                headers: { 'Authorization': `Bearer ${idToken}` }
                });
                const pdata = await pres.json();
                console.log('Payments data:', pdata);
                setPayments(pdata?.payments || []);
            }
            if (mode === 'Balances') {
                const bres = await fetch(`http://localhost:5000/api/groups/${group?.id}/payees?direction=both`, {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                });
                const bdata = await bres.json();
                setBalances({
                    youOwe: bdata.youOwe || [],
                    othersOweYou: bdata.othersOweYou || [],
                    totals: bdata.totals || { youOwe: 0, owedToYou: 0 }
                });
                console.log('balances: ', balances)
            }
        })();
    }, [group, mode, refreshKey]);

    return (
        <>
        <Toaster toastOptions={{
                    duration: 2200,
                    className: 'toast'
                }} position="top-center" />
        <div className={styles.groupPageContainer}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <div className={styles.avatarContainer}>
                        <img
                            src={avatarSrc}
                            alt={`${group?.name || 'Group'} avatar`}
                            className={styles.groupAvatar}
                            onError={(e) => { e.currentTarget.src = groupicon; }}
                        />
                    </div>
                    <div>
                        <strong>{group?.name}</strong>
                        <br />
                        <img src={groupicon} alt="Group icon" className="groupIcon" />
                        {group?.numberOfMembers} members
                    </div>
                </div>

                <div className={styles.buttonsContainer}>
                    <button className={styles.expenseButton} onClick={onAddExpense}>+ Add Expense</button>
                    <button className={styles.paymentButton} onClick={onAddPayment}>{symbol} Add Payment</button>
                </div>

            </div>
            <div className="divider"></div>
            <div className={styles.groupView}>
                <div className="tabs">
                    <button
                    type="button"
                    className={`tab ${mode === 'Expenses' ? 'tabActive' : ''}`}
                    onClick={() => { setMode('Expenses');}}
                    >
                    Expenses
                    </button>
                    <button
                    type="button"
                    className={`tab ${mode === 'Payments' ? 'tabActive' : ''}`}
                    onClick={() => { setMode('Payments'); }}
                    >
                    Payments
                    </button>
                    <button
                    type="button"
                    className={`tab ${mode === 'Balances' ? 'tabActive' : ''}`}
                    onClick={() => { setMode('Balances'); }}
                    >
                    Balances
                    </button>
                </div>
                {mode === 'Expenses' && <ExpensesPanel expenses={expenses} group={group} refreshKey={refreshKey} />}
                {mode === 'Payments' && <PaymentsPanel payments={payments} group={group} refreshKey={refreshKey} />}
                {mode === 'Balances' && <BalancesPanel balances={balances} group={group} refreshKey={refreshKey} onPayNow={onPayNow}/>}
            </div>
        </div>

        </>
    );
}
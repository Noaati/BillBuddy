
import groupicon from '../assets/groupIcon.png';
import hamburger from '../assets/hamburger.png';
import settings from '../assets/settingIcon.png';
import styles from './GroupPage.module.css';
import { useState, useEffect, useRef } from 'react';
import { auth } from '../lib/firebase';
import ExpensesPanel from './ExpensesPanel';
import PaymentsPanel from './PaymentsPanel';
import BalancesPanel from './BalancesPanel';
import { getCurrencySymbol } from '../utils/currency';
import { toast } from 'react-hot-toast';
import Modal from '../components/Modal';

export default function GroupPage({ group, onAddExpense = () => {}, refreshKey, onAddPayment = () => {}, onPayNow = () => {}, panel, onEditGroup = () => {}, onRestored = () => {}, onLeaveGroup = () => {} }) {
    const [mode, setMode] = useState(panel ?? 'Expenses');
    const [expenses, setExpenses] = useState(null);
    const avatarSrc = group?.image || groupicon;
    const [payments, setPayments] = useState(null);
    const [balances, setBalances] = useState(null);
    const symbol = getCurrencySymbol(group?.currency || 'USD');
    const [openActions, setOpenActions] = useState(false);

    const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
    const settingsRef = useRef(null);
    const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);

    useEffect(() => {
        if (panel && panel !== mode) setMode(panel);
    }, [panel]);

    useEffect(() => {
        (async () => {
            const idToken = await auth.currentUser?.getIdToken();
            if(mode === 'Expenses') {
                const res = await fetch(`${window.API_BASE}/expenses/${group?.id}`, {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                });
                const data = await res.json();
                console.log('Expenses data:', data);
                setExpenses(data?.expenses || []);
            }
            if(mode === 'Payments'){
                const pres = await fetch(`${window.API_BASE}/payments/${group?.id}`, {
                headers: { 'Authorization': `Bearer ${idToken}` }
                });
                const pdata = await pres.json();
                console.log('Payments data:', pdata);
                setPayments(pdata?.payments || []);
            }
            if (mode === 'Balances') {
                const bres = await fetch(`${window.API_BASE}/groups/${group?.id}/payees?direction=both`, {
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

    useEffect(() => { 
        function onDocClick(e) { 
            if (settingsRef.current && !settingsRef.current.contains(e.target)) {
                setDesktopMenuOpen(false);
            }
        }
     document.addEventListener('mousedown', onDocClick);
     return () => document.removeEventListener('mousedown', onDocClick);
   }, []);

   async function handleLeaveGroup() {
     try {
       const idToken = await auth.currentUser?.getIdToken();
       const r = await fetch(`${window.API_BASE}/groups/${group?.id}/leave`, {
         method: 'POST',
         headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' }
       });
       const data = await r.json().catch(() => ({}));
       if (!r.ok) throw new Error(data?.error || 'Leave failed');
       toast.success('You left the group');
       setConfirmLeaveOpen(false);
       onLeaveGroup();
     } catch (e) {
       toast.error(e.message || 'Leave failed');
     }
   }

    async function handleRestoreGroup() {
        const idToken = await auth.currentUser?.getIdToken();
        console.log('group', group);
        const dRes = await fetch(`${window.API_BASE}/groups/${group.id}/updateActive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ active: true })
        });
        const dData = await dRes.json();
        if (!dRes.ok) throw new Error(dData?.error || 'Deactivate failed');
        toast.success(`Group ${group.name} restored successfully`);
        onRestored();
    }

    return (
        <>
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

                {group?.active ? (
                <>
                    <div className={styles.buttonsContainerDesktop}>
                       <div className={styles.settingsMenuWrap} ref={settingsRef}>
                         <button
                             type="button"
                             className={styles.iconButton}
                             onClick={() => setDesktopMenuOpen(v => !v)}
                         >
                             <img src={settings} className={styles.settingsIcon} />
                         </button>
                         {desktopMenuOpen && (
                           <div className={styles.settingsMenu} role="menu">
                             <button
                               type="button"
                               role="menuitem"
                               className={styles.settingsMenuItem}
                               onClick={() => { setDesktopMenuOpen(false); onEditGroup(); }}
                             >
                               Edit Group
                             </button>
                             <div className={styles.settingsMenuDivider} />
                             <button
                               type="button"
                               role="menuitem"
                               className={`${styles.settingsMenuItem} ${styles.destructive}`}
                               onClick={() => { setDesktopMenuOpen(false); setConfirmLeaveOpen(true); }}
                             >
                               Leave Group
                             </button>
                           </div>
                         )}
                       </div>
                    <button className={styles.expenseButton} onClick={onAddExpense}>+ Add Expense</button>
                    <button className={styles.paymentButton} onClick={onAddPayment}>{symbol} Add Payment</button>
                    </div>

                    <div className={styles.buttonsContainerMobile}>
                    <button
                        type="button"
                        aria-label="More actions"
                        aria-haspopup="menu"
                        aria-expanded={openActions}
                        className={styles.actionsFab}
                        onClick={() => setOpenActions(v => !v)}
                    >
                        <img src={hamburger} alt="Menu" className={styles.hamburgerIcon} />
                    </button>

                    {openActions && (
                        <>
                        <div className={styles.actionsBackdrop} onClick={() => setOpenActions(false)} />
                        <div className={styles.actionsMenu} role="menu">
                            <button type="button" role="menuitem" className={styles.actionsItem}
                                    onClick={() => { onAddExpense(); setOpenActions(false); }}>
                            + Add Expense
                            </button>
                            <button type="button" role="menuitem" className={styles.actionsItem}
                                    onClick={() => { onAddPayment(); setOpenActions(false); }}>
                            {symbol} Add Payment
                            </button>
                           <div className={styles.actionsDivider} />
                           <button type="button" role="menuitem" className={styles.actionsItem}
                                   onClick={() => { onEditGroup(); setOpenActions(false); }}>
                             Edit Group
                           </button>
                           <button type="button" role="menuitem"
                                   className={`${styles.actionsItem} ${styles.destructive}`}
                                   onClick={() => { setOpenActions(false); setConfirmLeaveOpen(true); }}>
                             Leave Group
                           </button>
                        </div>
                        </>
                    )}
                    </div>
                </>
                ) : (
                <button className={styles.expenseButton} onClick={handleRestoreGroup}>
                    Restore Group
                </button>
                )}

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
        <Modal
          open={confirmLeaveOpen}
          onClose={() => setConfirmLeaveOpen(false)}
          title={`Leave “${group?.name}”?`}
          content={(
            <div>
              <p>
                If you leave, you’ll lose access to expenses & payments in this group.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className={styles.leaveModalButtons} onClick={() => setConfirmLeaveOpen(false)}>
                  Cancel
                </button>
                <button className={`${styles.leaveModalButtons} ${styles.leaveButton}`} onClick={handleLeaveGroup}>
                  Leave Group
                </button>
              </div>
            </div>
          )}
        />
      </>
    );
  }

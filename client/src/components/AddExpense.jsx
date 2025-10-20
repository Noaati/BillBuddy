import { useState, useEffect } from 'react';
import { auth } from '../lib/firebase';
import styles from './AddExpense.module.css';
import { getCurrencySymbol } from '../utils/currency';

export default function AddExpense({ group, onSuccess = () => {} }) {
  const [members, setMembers] = useState([]);
  const [paidBy, setPaidBy] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const symbol = getCurrencySymbol(group?.currency || 'USD');
  const [memberAmounts, setMemberAmounts] = useState({});
  const [manualIds, setManualIds] = useState(new Set());
  const SCALE = 100;
  const TOLERANCE_UNITS = 1;
  const round2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

  const displayedUnits = Array.from(selectedIds).reduce(
    (sum, id) => sum + Math.round((Number(getAmountPerMember(id)) || 0) * SCALE),
    0
  );
  const targetUnits = Math.round((Number(amount) || 0) * SCALE);

  const diffUnits  = displayedUnits - targetUnits;
  const isBalanced = Math.abs(diffUnits) <= TOLERANCE_UNITS;

  useEffect(() => {
    (async () => {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`${window.API_BASE}/groups/${group?.id}/members`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      const list = data?.members || [];
      setMembers(list);

      const allIds = new Set(list.map((m) => m.id));
      setSelectedIds(allIds);

      if (!paidBy && list.length) {
        const me = list.find(m => (m.userId ?? m.uid) === auth.currentUser?.uid) || list.find(m => m.email === auth.currentUser?.email);
        if (me?.id) setPaidBy(me.id);
      }
    })();
  }, [group?.id]);

  function equalSplit(e) {
    e?.preventDefault?.();
    setSelectedIds(new Set(members.map(m => m.id)));
    setManualIds(new Set());
    setMemberAmounts({});
  }


  function toggleMember(id, checked) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

    if (!checked) {
      setManualIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      setMemberAmounts((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
    }
  }

  function handleAmountPerPersonChange(e, id) {
    const amountPerMember = e.target.value;
    if (amountPerMember === '') {
      deselectMember(id);
      return;
    }

    const v = amountPerMember === '' ? '' : Number(amountPerMember);

    setMemberAmounts((prev) => ({ ...prev, [id]: v }));
    setManualIds((prev) => {
      const n = new Set(prev);
      n.add(id);
      return n;
    });
    setSelectedIds(prev => { const next = new Set(prev); next.add(id); return next; });

  }

  function deselectMember(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setManualIds(prev => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    setMemberAmounts(prev => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  }


  function getAmountPerMember(id) {
    if (!selectedIds.has(id)) return '';
    const total = Number(amount) || 0;

    let manualSum = 0;
    let manualCount = 0;
    manualIds.forEach((mid) => {
      if (selectedIds.has(mid)) {
        manualSum += Number(memberAmounts[mid]) || 0;
        manualCount++;
      }
    });

    const remaining = total - manualSum;
    const autoCount = selectedIds.size - manualCount;

    if (manualIds.has(id)) return memberAmounts[id] ?? 0;
    if (autoCount <= 0) return 0;
    return round2(remaining / autoCount);
  }

  async function handleAddExpense(){
    const idToken = await auth.currentUser?.getIdToken();
    const payload = {
    group: group?.id,
    paidBy: paidBy,
    amount: Number(amount),
    description: description,
    settled: false
    };

    console.log('expense: ', payload);

    const res = await fetch(`${window.API_BASE}/expenses/init`, { 
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
        console.error('Expense Create failed:', data);
        return;
    }
    const expenseId = data.expense._id;

    console.log('selectedIds:', selectedIds);

    const shares = Array.from(selectedIds).map((owesId) => ({
      owes: owesId,
      amount: Number(getAmountPerMember(owesId)),
      paid: owesId === paidBy ? Number(getAmountPerMember(owesId)) : 0
    }));

        console.log('shares:', shares);


    if(shares.length){
      const res2 = await fetch(`${window.API_BASE}/expenses/${expenseId}/shares/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ shares }),
      });
      const data2 = await res2.json();
      if (!res2.ok) { console.error('Shares bulk failed:', data2); return; }

      console.log('Created shares:', { expense: data.expense, sharesInserted: data2.inserted });
    }
    onSuccess();

  }

  return (
    <div>
      <strong>Group: {group?.name}</strong>

      <div className={styles.addExpenseForm}>
        <textarea placeholder="Description" required value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className={styles.inputWithPrefix}>
          <span className={styles.prefix}>{symbol}</span>
          <input
            type="number"
            placeholder="Amount"
            required
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label htmlFor="paidBy" className={styles.labelInline}>Paid by</label>
          <select id="paidBy" required value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>

        {amount && (
          <>
            {manualIds.size > 0 && (
              <a style={{color:'#E07B39'}}className="link" href="#!" onClick={equalSplit}>Reset to equal split</a>
            )}

            <div className={styles.membersList}>
              {members.map((m) => {
                const id = m.id;
                return (
                  <div key={id} className={styles.memberRow}>
                    <label className={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(id)}
                        onChange={(e) => toggleMember(id, e.target.checked)}
                      />
                      <span>{m.name}</span>
                    </label>

                    <input
                      type="number"
                      className={styles.amountInput}
                      step="0.01"
                      inputMode="decimal"
                      value={getAmountPerMember(id)}
                      onChange={(e) => handleAmountPerPersonChange(e, id)}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v === 0) {
                          deselectMember(id);
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: isBalanced ? '#2e7d32' : '#c62828' }}>
              {isBalanced ? '✓ Split is balanced' : `Not balanced: ${(diffUnits / SCALE).toFixed(2)}`}
            </div>

            <div>
              <button className="button" disabled={!amount || !selectedIds.size || !description || !isBalanced} onClick={handleAddExpense}>Add Expense</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

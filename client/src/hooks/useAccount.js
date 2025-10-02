import { useState, useEffect } from 'react';
import { auth } from '../lib/firebase';

export default function useAccount() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAccount() {
      try {
        const user = auth.currentUser;
        if (!user) { setLoading(false); return; }

        const token = await user.getIdToken();
        console.log('token:', token);
        const url = `http://localhost:5000/api/accounts/me`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        console.log('data:', data);
        setAccount(data.account);
      } catch (err) {
        console.error('useAccount error:', err);
        setAccount(null);
      } finally {
        setLoading(false);
      }
    }
    fetchAccount();
  }, []);

  return { account, loading };
}

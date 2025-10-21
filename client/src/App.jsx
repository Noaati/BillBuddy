import useAuth from './hooks/useAuth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { useEffect } from "react";

export default function App() {
  const { user, loading } = useAuth();

  useEffect(() => {
    async function maybeAccept() {
      if (!user) return;
      const m = window.location.pathname.match(/\/join\/([^/]+)/);
      const token = (m && m[1]) || localStorage.getItem('pending_invite_token');
      if (!token) return;

      try {
        const idToken = await user.getIdToken();
        await fetch(`${window.API_BASE}/invite/accept`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({ token }),
        });
      } catch (e) {
        console.warn('invite accept failed', e);
      } finally {
        localStorage.removeItem('pending_invite_token');
        window.history.replaceState(null, '', '/');
      }
    }
    maybeAccept();
  }, [user]);

  if (loading) return <div style={{ padding: 20 }}>
    <div style={{ textAlign: 'center', padding: 12 }}>
      <div className="spinner" role="status" aria-label="Loading" />
    </div>
  </div>;

  return user ? <Dashboard /> : <Login />;
}
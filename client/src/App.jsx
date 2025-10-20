import useAuth from './hooks/useAuth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ padding: 20 }}>
    <div style={{ textAlign: 'center', padding: 12 }}>
      <div className="spinner" role="status" aria-label="Loading" />
    </div>
  </div>;

  return user ? <Dashboard /> : <Login />;
}
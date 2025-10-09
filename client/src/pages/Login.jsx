import { useState } from 'react';
import styles from './Login.module.css';
import billbuddyLogo from '../assets/BillBuddy - Logo.png';
import { auth } from '../lib/firebase';
import '../App.css';
import { signInWithEmailAndPassword, sendPasswordResetEmail, createUserWithEmailAndPassword } from 'firebase/auth';

export default function Login() {
  const [mode, setMode] = useState('signin'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    let idToken = null;
    if (mode === 'signin') {
        try {
            setLoading(true);
            const cred = await signInWithEmailAndPassword(auth, email, password);
            idToken = await cred.user.getIdToken();

            localStorage.setItem('bb_id_token', idToken);

            console.log('Signed in as:', cred.user.email);
        } catch (err) {
            console.log('Sign in error:', err?.code, err?.message);
            setError(getAuthErrorMessage(err));
        } finally {
            setLoading(false);
            await acceptInviteIfPending(); 
        }
    }
    else{
        try {
            setLoading(true);
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            idToken = await cred.user.getIdToken(); 

            localStorage.setItem('bb_id_token', idToken);
            console.log('Signed up as:', cred.user.email);
            const firstName = document.getElementById('firstName')?.value || '';
            const lastName  = document.getElementById('lastName')?.value  || '';

            await fetch('http://localhost:5000/api/accounts/init', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
              },
              body: JSON.stringify({ firstName, lastName }),
            });

            await fetch('http://localhost:5000/api/invites/claim', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
              },
            });
        } catch (err) {
            console.log('Sign up error:', err?.code, err?.message);
            setError(getAuthErrorMessage(err));
        } finally {
            setLoading(false);
            await acceptInviteIfPending(); 
      }
    }
  }

  async function acceptInviteIfPending() {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return;
    let pendingToken = localStorage.getItem('pending_invite_token') ||
    new URLSearchParams(window.location.search).get('invite');

    if (!pendingToken) {
      const m = window.location.pathname.match(/\/join\/([^/]+)/);
      if (m && m[1]) pendingToken = m[1];
    }

    if (!pendingToken) return;

    try {
      await fetch('http://localhost:5000/api/invite/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ token: pendingToken }),
      });
    } catch (e) {
      console.warn('invite accept failed', e);
    } finally {
      localStorage.removeItem('pending_invite_token');
    }
  }


  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <img src={billbuddyLogo} alt="BillBuddy logo" className={styles.logo} />

        <div className="tabs">
          <button
            type="button"
            className={`tab ${mode === 'signin' ? 'tabActive' : ''}`}
            onClick={() => { setMode('signin'); setError(''); setMessage(''); }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`tab ${mode === 'signup' ? 'tabActive' : ''}`}
            onClick={() => { setMode('signup'); setError(''); setMessage(''); }}
          >
            Sign up
          </button>
        </div>

        <p className={styles.subtitle}>
          {mode === 'signin'
            ? 'Sign in to manage your shared expenses'
            : 'Create your account to start splitting bills'}
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <>
              <label className={styles.label} htmlFor="firstName">First name</label>
              <input className={styles.input} id="firstName" type="text" placeholder="Jane" required />

              <label className={styles.label} htmlFor="lastName">Last name</label>
              <input className={styles.input} id="lastName" type="text" placeholder="Doe" required />
            </>
          )}

          <label className={styles.label} htmlFor="email">Email</label>
          <input
            className={styles.input}
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (error) setError(''); if (message) setMessage(''); }}
          />

          <label className={styles.label} htmlFor="password">Password</label>
          <input
            className={styles.input}
            id="password"
            type="password"
            placeholder="••••••••"
            required
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (error) setError(''); if (message) setMessage(''); }}
          />

          {message && (
            <div
                style={{
                padding: '10px 12px',
                marginBottom: 12,
                textAlign: 'center'
                }}
            >
                {message}
            </div>
            )}

          {error && (
            <div
                style={{
                background: '#fdecec',
                color: '#a30000',
                border: '1px solid #f5b5b5',
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 12,
                textAlign: 'center',
                fontSize: 13,
                }}
            >
                {error}
            </div>
            )}

          <button className="button" type="submit" disabled={loading}>
            {loading
              ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
              : (mode === 'signin' ? 'Sign in' : 'Create account')}
          </button>

          {mode === 'signin' && (
            <>
              <div className={styles.helper}>
                Forgot your password? <a className={styles.link} href="#" onClick={handleResetPassword}>Reset</a>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );

  function getAuthErrorMessage(err) {
    const code = err?.code || '';
    const map = {
      'auth/invalid-credential': 'האימייל או הסיסמה שגויים',
      'auth/invalid-login-credentials': 'האימייל או הסיסמה שגויים',
      'auth/invalid-email': 'האימייל אינו תקין',
      'auth/user-disabled': 'המשתמש הזה הושבת',
      'auth/user-not-found': 'לא נמצא משתמש עם האימייל הזה',
      'auth/wrong-password': 'האימייל או הסיסמה שגויים',
      'auth/too-many-requests': 'יותר מדי נסיונות. נסו שוב בעוד כמה דקות',
      'auth/network-request-failed': 'בעיית רשת. בדקו חיבור ונסו שוב',
      'auth/internal-error': 'שגיאה פנימית. נסו שוב',
      'auth/email-already-in-use': 'האימייל כבר בשימוש',
      'auth/weak-password': 'הסיסמה קצרה מדי (מינימום 6 תווים)',
    };
    return map[code] || 'לא הצלחנו להיכנס. בדקו את הפרטים ונסו שוב';
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!email) {
      setError('כדי לאפס סיסמה, הזינו קודם את כתובת האימייל.');
      return;
    }
    try{
      await sendPasswordResetEmail(auth, email);
      setMessage('במידה וקיים משתמש עם כתובת האימייל הזו, יישלח קישור לאיפוס הסיסמה');
    } catch {
      setError('כדי לאפס סיסמה, הזינו קודם את כתובת האימייל');
    }
  }
}




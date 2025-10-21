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

            await fetch(`${window.API_BASE}/accounts/init`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
              },
              body: JSON.stringify({ firstName, lastName }),
            });

            // link the Account to existing group member
            await fetch(`${window.API_BASE}/invites/claim`, {
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
      await fetch(`${window.API_BASE}/invite/accept`, {
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
      'auth/invalid-credential': 'Email or password is incorrect',
      'auth/invalid-login-credentials': 'Email or password is incorrect',
      'auth/invalid-email': 'Invalid email address',
      'auth/user-disabled': 'This user account has been disabled',
      'auth/user-not-found': 'No user found with this email address',
      'auth/wrong-password': 'Email or password is incorrect',
      'auth/too-many-requests': 'Too many attempts. Please try again later',
      'auth/network-request-failed': 'Network error. Please check your connection and try again',
      'auth/internal-error': 'Internal error. Please try again',
      'auth/email-already-in-use': 'This email address is already in use',
      'auth/weak-password': 'Password is too short (minimum 6 characters)',
    };
    return map[code] || 'We couldn’t sign you in. Please check your details and try again';
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!email) {
      setError('Please enter your email address to reset your password.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('If an account with this email exists, a password reset link has been sent.');
    } catch {
      setError('Please enter your email address to reset your password.');
    }
  }

}




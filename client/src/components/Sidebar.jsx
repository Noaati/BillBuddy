import styles from './Sidebar.module.css';
import { useEffect, useState } from 'react';
import billbuddyLogo from '../assets/BillBuddy - Logo.png';
import groupicon from '../assets/groupIcon.png';
import logout from '../assets/Logout.png';
import { auth } from '../lib/firebase';
import '../App.css';

export default function Sidebar({ onSelectGroup = () => {} , onNewGroup = () => {} , account, selectedGroupId}) {
    const [groups, setGroups] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const idToken = await auth.currentUser.getIdToken();
                const res = await fetch('http://localhost:5000/api/groups', {
                headers: { 'Authorization': `Bearer ${idToken}` }
                });
                const data = await res.json();
                if (res.ok && data.ok) {
                    setGroups(data.groups || []);
                    setLoading(false);
                } else {
                    console.error('Fetch groups failed:', data);
                    setGroups([]);
                }
            } catch (e) {
                console.error('Error fetching groups:', e);
                setGroups([]);
            }
            finally {
                setLoading(false);
            }
        })();
    }, []);


    async function handleLogout() {
        try {
            await auth.signOut();
            localStorage.removeItem('bb_id_token');
            window.location.reload();
        } catch (err) {
            console.error('Logout error:', err);
        }
    }

  return (
    <div className={styles.sideBarContainer}>
        <img src={billbuddyLogo} alt="BillBuddy logo" className={styles.logo} />
        
        <p>Hello {account?.firstName || ''}!</p>
        <div className="divider"></div>
        <button className="button" onClick={onNewGroup}>+ Create New Group</button>
        <h4>Your Groups</h4>
        {groups === null && (
            <div style={{ padding: 12, textAlign: 'center' }}>
                <div className="spinner" role="status" aria-label="Loading" />
            </div>
        )}
        {Array.isArray(groups) && groups.length > 0 &&
        <div>
            {groups.map(g => (
                <div className={styles.groupItem} key={g.id}>
                    <button
                        onClick={() => onSelectGroup(g)}
                        className={`${styles.groupButton} ${selectedGroupId === g.id ? styles.groupButtonActive : ''}`}
                    >
                        <img src={groupicon} alt="Group icon" className="groupIcon" />
                        <span>{g.name}</span>
                        <div className={styles.numberOfMembers}>{g.numberOfMembers}</div>
                    </button>
                </div>
            ))}

            {!loading && Array.isArray(groups) && groups.length === 0 && (
                <div className={styles.noGroup}>No groups yet.
                <br />
                Create one to get started!</div>
            )}
        </div>
        }

        <div className={styles.bottomSection}>
        <div className="divider"></div>
        <div className={styles.linksList} onClick={handleLogout}>
            <img src={logout} alt="Logout" className={styles.icon} />
            <a className="link" href="#">Logout</a>
        </div>
        </div>


    </div>
  );
}




import { useState, useEffect, useMemo } from 'react';
import styles from './CreateNewGroup.module.css';
import defaultAvatar from "../assets/defaultAvatar.png";
import archiveIcon from "../assets/archiveIcon.png";
import { auth } from '../lib/firebase';
import { toast } from 'react-hot-toast';

export default function CreateNewGroup({ account, onSuccess = () => {}, group = null }) {
    const [members, setMembers] = useState([]);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [currencyCode, setCurrencyCode] = useState('USD');
    const [currencies, setCurrencies] = useState([]);
    const [groupName, setGroupName] = useState('');
    const [file, setFile] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [toDeactivate, setToDeactivate] = useState([]);
    const [inviteLink, setInviteLink] = useState('');
    const [addMemberMode, setAddMemberMode] = useState('manual');
    const selfEmail = auth.currentUser?.email?.toLowerCase() || '';

    const [recentContacts, setRecentContacts] = useState([]);
    const [suggestions, setSuggestions] = useState({});


    useEffect(() => {
        if (group) {
        setGroupName(group.name || '');
        setCurrencyCode(group.currency || 'USD');
        setPreviewUrl(group.image || null);
        }
    }, [group]);

    useEffect(() => {
        (async () => {
            try {
            const idToken = await auth.currentUser?.getIdToken();
            const r = await fetch(`${window.API_BASE}/myMembers`, {
                headers: { Authorization: `Bearer ${idToken}` }
            });
            const data = await r.json();
            setRecentContacts(data?.contacts || []);
            } catch(e) { console.warn('load contacts failed', e); }
        })();
        }, []);

        function handleNameChange(memberId, value) {
        upsertMember(memberId, 'name', value);
        const v = value.trim().toLowerCase();
        if (!v) return setSuggestions(s => ({ ...s, [memberId]: [] }));

        const opts = recentContacts
            .filter(c => (c.name?.toLowerCase().includes(v)))
            .slice(0, 6);
        setSuggestions(s => ({ ...s, [memberId]: opts }));
        }

        function selectSuggestion(memberId, contact) {
        setSuggestions(s => ({ ...s, [memberId]: [] }));
        setMembers(prev => prev.map(m =>
            m.id === memberId ? { ...m, name: contact.name, email: contact.email } : m
        ));
    }

    function blurSuggestions(memberId) {
        setTimeout(() => {
            setSuggestions(s => ({ ...s, [memberId]: [] }));
        }, 120);
    }


    function handleFileChange(e) {
        const file = e.target.files?.[0];
        if (!file) {
            setPreviewUrl(null);
            return;
        }
        setFile(file);
        const url = URL.createObjectURL(file);
        setPreviewUrl(file ? url : null);

    }

    useEffect(() => {
        return () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    useEffect(() => {
        fetch(`${window.API_BASE}/meta/currencies`)
        .then(r => r.json())
        .then(setCurrencies)
        .catch(() => setCurrencies(['USD','EUR','GBP','ILS']));
    }, []);

    useEffect(() => {
        if (group) return;
        const fullName = [account?.firstName, account?.lastName].filter(Boolean).join(' ');
        const u = auth.currentUser; 
        console.log(u);
        setMembers([{
            id: account?._id,
            name: fullName || "",
            email: account?.email || "",
            isExisting: false,
            isSelf: true
        }]);
        handleAddMember();
    }, []);

    useEffect(() => {
        if (!group) return;
        (async () => {
        try {
            const idToken = await auth.currentUser?.getIdToken();
            const r = await fetch(`${window.API_BASE}/groups/${group.id || group._id}/members`, {
            headers: { 'Authorization': `Bearer ${idToken}` }
            });
            const data = await r.json();
            if (r.ok && Array.isArray(data?.members)) {
            const rows = data.members.map(m => ({
                id: m.id,
                name: m.name,
                email: m.email || '',
                isExisting: true,
                isSelf: (m.email || '').toLowerCase() === selfEmail
            }));
            setMembers(rows);
            }
        } catch (e) {
            console.warn('load members failed', e);
        }
        })();
    }, [group]);

    function upsertMember(id, field, value) {
        setMembers(prev => {
            const idx = prev.findIndex(m => m.id === id);

            if (idx !== -1) {
                const next = [...prev];
                next[idx] = { ...next[idx], [field]: value };
                return next;
            }
            const newId = id ?? (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
            const newMember = { id: newId, name: "", email: "", isExisting: false, [field]: value };
            return [...prev, newMember];
        });
    }

    function handleRemoveMember(id) {
        setMembers(prev => {
        const target = prev.find(m => m.id === id);
        if (target?.isExisting) {
            setToDeactivate(d => d.includes(id) ? d : [...d, id]);
        }
        return prev.filter(m => m.id !== id);
        });
    }

    function handleAddMember(e) { 
        if (e) e.preventDefault(); 
        setMembers(prev => [...prev, { id: crypto.randomUUID(), name: "", email: "", isExisting: false}]);

    }

    async function handleDeactivateGroup(){
        const idToken = await auth.currentUser?.getIdToken();
        console.log('group', group);
        const dRes = await fetch(`${window.API_BASE}/groups/${group.id}/updateActive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ active: false })
        });
        const dData = await dRes.json();
        if (!dRes.ok) throw new Error(dData?.error || 'Deactivate failed');
        onSuccess({ fullGroup: null });
        toast.success(`Group ${group.name} archived successfully`);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setSubmitting(true);
        try {
            let imageUrlToSave = group ? (group?.image || defaultAvatar) : defaultAvatar;
            if (file) {
                const fd = new FormData();
                fd.append('image', file);
                const uploadRes = await fetch(`${window.API_BASE}/upload`, { method: 'POST', body: fd });
                const { url } = await uploadRes.json();
                imageUrlToSave = url;
            }

            const idToken = await auth.currentUser?.getIdToken();
            const payload = { groupId: group ? (group.id || group._id) : null, groupName, currencyCode, imageUrl: imageUrlToSave, inviteLink };

            const res = await fetch(`${window.API_BASE}/groups/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || 'Group init failed');
            const groupId = group ? (group.id || group._id) : data.group._id;
            let invites = [];

            if(!group){
                invites = (members || [])
                .filter(m => (m.name || '').trim() && (m.email || '').trim())
                .map(m => ({ name: m.name.trim(), email: m.email.trim().toLowerCase() }));
            }
            else{
                invites = (members || [])
                .filter(m => !m.isExisting)
                .filter(m => (m.name || '').trim() && (m.email || '').trim())
                .map(m => ({ name: m.name.trim(), email: m.email.trim().toLowerCase() }));
            }

            if (invites.length) {
                const mRes = await fetch(`${window.API_BASE}/groups/${groupId}/members/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                    body: JSON.stringify({ invites })
                });
                const mData = await mRes.json();
                if (!mRes.ok) throw new Error(mData?.message || 'Members bulk failed');
            }

            if (toDeactivate.length) {
                const dRes = await fetch(`${window.API_BASE}/members/deactivate-bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                    body: JSON.stringify({ memberIds: toDeactivate })
                });
                const dData = await dRes.json();
                if (!dRes.ok) throw new Error(dData?.error || 'Deactivate failed');
            }

            let fullGroup = null;
            try {
                const gRes = await fetch(`${window.API_BASE}/groups/${groupId}`, {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                });
                const gData = await gRes.json();
                if (gRes.ok && gData?.group) {
                    const g = gData.group;
                    fullGroup = {
                    id: g._id || g.id,
                    name: g.name,
                    currency: g.currency,
                    image: g.image,
                    numberOfMembers: g.numberOfMembers,
                    };
                }
            } catch (e) {
                console.warn('Fetch group details failed; using fallback.', e);
            }

            onSuccess({ fullGroup });

        } catch (err) {
            console.error(err);
            alert('Creation failed: ' + (err?.message || 'Unknown error'));
        } finally {
            setSubmitting(false);
        }
    }

    function handleCreateInviteLink(e) {
        e.preventDefault();
        const token = makeUrlSafeToken();
        setInviteLink(`${window.API_BASE}/join/${token}`);
        setAddMemberMode('link');
    }

    function makeUrlSafeToken(bytes = 16) {
        const arr = new Uint8Array(bytes);
        crypto.getRandomValues(arr);
        let s = '';
        for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
    }

    async function handleCopyLink(){
        try {
            await navigator.clipboard.writeText(inviteLink);
            toast.success('Link copied!');
        } catch (e) {
            console.error('Copy failed: ' + e);
        }
    }

    const isFormValid = useMemo(() => {
        const hasMembers = addMemberMode === 'manual' ? members.length > 0 : true;
        const membersValid = addMemberMode === 'manual' ? members.every(m => m.name.trim() && m.email.trim()): true;
        const hasGroupName = !!groupName.trim();
        const hasCurrency = !!currencyCode;
        return hasMembers && membersValid && hasGroupName && hasCurrency;
    }, [members, groupName, currencyCode, addMemberMode]);

    if (submitting) {
        return (
            <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 260,
            padding: 20
            }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{
                width: 40,
                height: 40,
                border: '4px solid #eee',
                borderTopColor: '#555',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
            }} />
            <div style={{ marginTop: 12 }}>{group ? 'Updating your group…' : 'Creating your group…'}</div>
            </div>
        );
    }

    return (
        <div>
            <div className={styles.groupForm}>
                <div className={styles.groupFields}>
                    <input type="text" placeholder="Group Name" value={groupName} onChange={(e) => setGroupName(e.target.value)} required />
                    <select required value={currencyCode} onChange={(e)=>setCurrencyCode(e.target.value)}>
                        {currencies.map(code => (
                        <option key={code} value={code}>{code}</option>
                        ))}
                    </select>
                </div>
                <label className={styles.profileImage} style={{ cursor: 'pointer' }}>
                <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    hidden
                />
                <img
                    src={previewUrl || defaultAvatar}
                    alt="Group profile"
                    className={styles.profileImageImg}
                />
                </label>
            </div>
            <h4>Add Group Members</h4>
            {addMemberMode === 'manual' ? (
            <>
            <p>
                Send an <a className={styles.links} href="#" onClick={handleCreateInviteLink}>invite link</a> to this group.
            </p>
            {members.map((m) => (
            <div
            key={m.id}
            style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr auto",
                gap: 8,
                alignItems: "center",
                marginBottom: 8
            }}
            >
            <div className={styles.suggestWrap}>
                <input
                    type="text"
                    placeholder="Full name"
                    value={m.name}
                    onChange={(e) => handleNameChange(m.id, e.target.value)}
                    required={!m.isExisting}
                    readOnly={(!!group && m.isExisting) || (!!m.isSelf)}
                    onBlur={() => blurSuggestions(m.id)}
                />

                {suggestions[m.id]?.length > 0 && (
                    <div className={styles.suggestBox}>
                    {suggestions[m.id].map((c, idx) => (
                        <button
                        key={idx}
                        type="button"
                        className={styles.suggestItem}
                        onClick={() => selectSuggestion(m.id, c)}
                        >
                        <span className={styles.suggestName}>{c.name}</span>
                        </button>
                    ))}
                    </div>
                )}
            </div>
                <input
                    type="email"
                    placeholder="Email"
                    value={m.email}
                    onChange={(e) => upsertMember(m.id, "email", e.target.value)}
                    required={!m.isExisting}
                    readOnly={(!!group && m.isExisting) || (!!m.isSelf)}
                />
                {!m.isSelf && (
                    <button className={styles.removeMemberButton} onClick={() => handleRemoveMember(m.id)}>✕</button>
                )}
            </div>
        ))}
        <a className="link" href="#" onClick={handleAddMember}>+ Add a member</a>
        </>
        ) : (
        <>
        <div className={styles.inviteLinkContainer}>
            <input type="text" value={inviteLink} readOnly></input>
            <button className={styles.copyButton} onClick={handleCopyLink}>Copy</button>
        </div>
        <a
        href="#"
        className={styles.links}
        onClick={(e) => {
            e.preventDefault();
            setAddMemberMode('manual');
        }}
        >
        Or add group members manually
        </a>
        </>
        )}
        <br />
        <div className={styles.actions}>
            <button className="button" type="submit" onClick={handleSubmit} disabled={!isFormValid}>
                {group ? 'Save changes' : 'Create'}
            </button>
            {group && (
                <button className={styles.archiveButton} type="button" onClick={handleDeactivateGroup}>
                    <img src={archiveIcon} alt="archive icon" className={styles.archiveIcon} />
                    Archive Group
                </button>
            )}
        </div>
    </div>
    );
}

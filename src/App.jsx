import React, { useCallback, useEffect, useMemo, useState } from 'react';
import EntryForm from './components/EntryForm.jsx';
import EntryCard from './components/EntryCard.jsx';

const COLLECTIONS = { profiles: 'profiles', entries: 'entries' };

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayWorkday() {
  const date = new Date();
  if (date.getDay() === 0) date.setDate(date.getDate() - 2);
  if (date.getDay() === 6) date.setDate(date.getDate() - 1);
  return localDate(date);
}

function shiftDate(value, amount) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDate(date);
}

function formatDate(value, options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, options).format(new Date(`${value}T12:00:00`));
}

function readPreference(key, fallback = '') {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function savePreference(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The app remains fully usable when storage is unavailable.
  }
}

function unwrapRecords(records) {
  return (Array.isArray(records) ? records : []).map((record) => ({
    id: record.id,
    ...(record.data || {}),
    updated_at: record.updated_at,
  }));
}

function sortByName(items) {
  return [...items].sort((a, b) =>
    String(a.displayName || a.name || '').localeCompare(String(b.displayName || b.name || ''), undefined, {
      sensitivity: 'base',
    }),
  );
}

function emailPassword(email) {
  const cleanEmail = email.trim().toLowerCase();
  return `standup-board-${cleanEmail}-account-v1`;
}

function waitForServices() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (window.VPAuth && window.VPData) return resolve();
      if (Date.now() - started > 12000) return reject(new Error('The workspace services are taking too long to load.'));
      window.setTimeout(check, 100);
    };
    check();
  });
}

function Icon({ children, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

function App() {
  const [servicesReady, setServicesReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [signedInUser, setSignedInUser] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [signInErrors, setSignInErrors] = useState({});
  const [signInBusy, setSignInBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetNotice, setResetNotice] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);

  const currentDate = localDate();
  const defaultDate = todayWorkday();
  const [selectedDate, setSelectedDate] = useState(() => {
    const saved = readPreference('standupBoard.selectedDate', defaultDate);
    return saved && saved <= currentDate ? saved : defaultDate;
  });
  const [memberSearch, setMemberSearch] = useState(() => readPreference('standupBoard.memberSearch'));
  const [userSearch, setUserSearch] = useState(() => readPreference('standupBoard.userSearch'));
  const [activeView, setActiveView] = useState('board');

  const [entries, setEntries] = useState([]);
  const [boardStatus, setBoardStatus] = useState('loading');
  const [boardError, setBoardError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [userProfiles, setUserProfiles] = useState([]);
  const [usersStatus, setUsersStatus] = useState('idle');
  const [usersError, setUsersError] = useState('');
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [resetRequests, setResetRequests] = useState([]);
  const [adminError, setAdminError] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminNotice, setAdminNotice] = useState('');
  const [adminFormError, setAdminFormError] = useState('');

  const isOwner = Boolean(signedInUser?.isOwner);
  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.userId || profile.id, profile])),
    [profiles],
  );

  const loadProfiles = useCallback(async () => {
    const list = unwrapRecords(await window.VPData.list(COLLECTIONS.profiles));
    setProfiles(sortByName(list));
    return list;
  }, []);

  const ensureProfile = useCallback(async (authUser, allProfiles = []) => {
    const existing = allProfiles.find(
      (profile) =>
        profile.userId === authUser.id ||
        profile.id === authUser.id ||
        String(profile.email || '').toLowerCase() === String(authUser.email || '').toLowerCase(),
    );
    if (existing) {
      const updated = {
        ...existing,
        userId: authUser.id,
        displayName: existing.displayName || authUser.name || authUser.email,
        email: authUser.email,
        role: authUser.isOwner ? 'owner' : 'member',
      };
      if (
        updated.displayName !== existing.displayName ||
        updated.role !== existing.role ||
        updated.userId !== existing.userId
      ) {
        await window.VPData.update(COLLECTIONS.profiles, existing.id, updated);
      }
      return updated;
    }

    const profile = {
      userId: authUser.id,
      displayName: authUser.name || authUser.email,
      email: authUser.email,
      role: authUser.isOwner ? 'owner' : 'member',
      createdAt: new Date().toISOString(),
    };
    await window.VPData.add(COLLECTIONS.profiles, profile, authUser.id);
    return profile;
  }, []);

  const initialize = useCallback(async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      await waitForServices();
      setServicesReady(true);
      const [authUser, allProfiles] = await Promise.all([
        window.VPAuth.me(),
        window.VPData.list(COLLECTIONS.profiles).then(unwrapRecords),
      ]);
      setProfiles(sortByName(allProfiles));
      if (authUser) {
        const profile = await ensureProfile(authUser, allProfiles);
        setSignedInUser({
          ...authUser,
          name: profile.displayName,
          email: profile.email,
        });
        const refreshed = unwrapRecords(await window.VPData.list(COLLECTIONS.profiles));
        setProfiles(sortByName(refreshed));
      } else {
        setSignedInUser(null);
      }
    } catch (error) {
      setAuthError(error?.message || 'We couldn’t check your workspace. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  }, [ensureProfile]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const loadBoard = useCallback(async () => {
    if (!signedInUser || !servicesReady) return;
    setBoardStatus('loading');
    setBoardError('');
    try {
      const [profileRows, entryRows] = await Promise.all([
        window.VPData.list(COLLECTIONS.profiles),
        window.VPData.list(COLLECTIONS.entries),
      ]);
      const loadedProfiles = sortByName(unwrapRecords(profileRows));
      setProfiles(loadedProfiles);
      setEntries(unwrapRecords(entryRows));
      setBoardStatus('ready');

      const myExisting = unwrapRecords(entryRows).find(
        (entry) => entry.userId === signedInUser.id && entry.date === selectedDate,
      );
      if (!myExisting && !editingEntry) {
        setFormOpen(true);
      } else if (myExisting && !editingEntry) {
        setFormOpen(false);
      }
    } catch (error) {
      setBoardStatus('error');
      setBoardError(error?.message || 'We couldn’t load this day’s standups.');
    }
  }, [editingEntry, selectedDate, servicesReady, signedInUser]);

  useEffect(() => {
    if (signedInUser && activeView === 'board') loadBoard();
  }, [signedInUser, activeView, selectedDate, loadBoard]);

  const loadUsers = useCallback(async () => {
    if (!signedInUser?.isOwner) {
      setActiveView('board');
      return;
    }
    setUsersStatus('loading');
    setUsersError('');
    setAdminError('');
    try {
      const records = await window.VPData.list(COLLECTIONS.profiles);
      setUserProfiles(sortByName(unwrapRecords(records)));
      setUsersStatus('ready');
    } catch (error) {
      setUsersStatus('error');
      setUsersError(error?.message || 'We couldn’t load the user list.');
    }

    try {
      const [accounts, requests] = await Promise.all([
        window.VPAuth.adminListUsers(),
        window.VPAuth.adminListResetRequests(),
      ]);
      setAdminAccounts(Array.isArray(accounts) ? accounts : []);
      setResetRequests(Array.isArray(requests) ? requests : []);
    } catch (error) {
      setAdminError(error?.message || 'The account tools could not be loaded. You can retry.');
    }
  }, [signedInUser]);

  useEffect(() => {
    if (activeView === 'users' && signedInUser) loadUsers();
  }, [activeView, signedInUser, loadUsers]);

  useEffect(() => savePreference('standupBoard.selectedDate', selectedDate), [selectedDate]);
  useEffect(() => savePreference('standupBoard.memberSearch', memberSearch), [memberSearch]);
  useEffect(() => savePreference('standupBoard.userSearch', userSearch), [userSearch]);

  const selectedEntries = useMemo(
    () => entries.filter((entry) => entry.date === selectedDate),
    [entries, selectedDate],
  );
  const sortedEntries = useMemo(
    () =>
      [...selectedEntries].sort((a, b) => {
        const nameA = profileById.get(a.userId)?.displayName || a.displayName || '';
        const nameB = profileById.get(b.userId)?.displayName || b.displayName || '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      }),
    [profileById, selectedEntries],
  );
  const visibleEntries = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return sortedEntries;
    return sortedEntries.filter((entry) =>
      (profileById.get(entry.userId)?.displayName || entry.displayName || '').toLowerCase().includes(query),
    );
  }, [memberSearch, profileById, sortedEntries]);
  const ownEntry = selectedEntries.find((entry) => entry.userId === signedInUser?.id);
  const missingCount = Math.max(profiles.length - selectedEntries.length, 0);

  function changeDate(nextDate) {
    if (nextDate <= currentDate) {
      setSelectedDate(nextDate);
      setEditingEntry(null);
      setSaveError('');
      setSaveNotice('');
    }
  }

  async function handleContinue(event) {
    event.preventDefault();
    const errors = {};
    const normalizedEmail = email.trim().toLowerCase();
    if (!displayName.trim()) errors.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) errors.email = 'Enter a valid email address.';
    if (resetMode && resetPassword.length < 1) errors.password = 'Enter the password you received.';
    setSignInErrors(errors);
    setResetNotice('');
    if (Object.keys(errors).length) return;

    setSignInBusy(true);
    setAuthError('');
    try {
      await waitForServices();
      const knownProfiles = unwrapRecords(await window.VPData.list(COLLECTIONS.profiles));
      let authUser;
      const knownProfile = knownProfiles.find(
        (profile) => String(profile.email || '').toLowerCase() === normalizedEmail,
      );
      if (knownProfile || resetMode) {
        if (!knownProfile && resetMode) throw new Error('No profile was found for this email. Turn off reset-password sign-in to create an account.');
        authUser = await window.VPAuth.login(
          normalizedEmail,
          resetMode ? resetPassword : emailPassword(normalizedEmail),
        );
      } else {
        const password = emailPassword(normalizedEmail);
        try {
          authUser = await window.VPAuth.register(normalizedEmail, password, displayName.trim());
        } catch (registerError) {
          // A profile may have been created between the profile check and registration.
          authUser = await window.VPAuth.login(normalizedEmail, password);
        }
      }
      const profile = await ensureProfile(authUser, knownProfiles);
      setSignedInUser({ ...authUser, name: profile.displayName, email: profile.email });
      setProfiles(sortByName(unwrapRecords(await window.VPData.list(COLLECTIONS.profiles))));
      setSignInErrors({});
      setResetPassword('');
      setResetMode(false);
      setActiveView('board');
    } catch (error) {
      setAuthError(error?.message || 'We couldn’t sign you in. Check your details and try again.');
    } finally {
      setSignInBusy(false);
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    setResetNotice('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setSignInErrors((old) => ({ ...old, email: 'Enter a valid email address first.' }));
      return;
    }
    setRequestBusy(true);
    try {
      await waitForServices();
      await window.VPAuth.requestReset(email.trim().toLowerCase());
    } catch {
      // Keep the response neutral so account existence is not disclosed.
    } finally {
      setRequestBusy(false);
      setResetNotice('If an account matches that email, reset instructions are on their way.');
    }
  }

  async function handleSaveEntry(values, fieldErrors) {
    setSaveError('');
    setSaveNotice('');
    const errors = {};
    if (!values.yesterday.trim()) errors.yesterday = 'Add what you did yesterday.';
    if (!values.today.trim()) errors.today = 'Add what you plan to do today.';
    if (Object.keys(errors).length) {
      fieldErrors(errors);
      return;
    }

    setSaveBusy(true);
    try {
      const mine = unwrapRecords(await window.VPData.list(COLLECTIONS.entries, { mine: true }));
      const existing = mine.find((entry) => entry.userId === signedInUser.id && entry.date === selectedDate);
      const now = new Date().toISOString();
      const data = {
        userId: signedInUser.id,
        date: selectedDate,
        yesterday: values.yesterday.trim(),
        today: values.today.trim(),
        blockers: values.blockers.trim(),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      if (existing) {
        await window.VPData.update(COLLECTIONS.entries, existing.id, data);
      } else {
        await window.VPData.add(COLLECTIONS.entries, data);
      }
      setEditingEntry(null);
      setFormOpen(false);
      setSaveNotice('Your standup is saved.');
      await loadBoard();
    } catch (error) {
      setSaveError(error?.message || 'We couldn’t save your standup. Your updates are still here—please retry.');
    } finally {
      setSaveBusy(false);
    }
  }

  function startEditing(entry) {
    setEditingEntry(entry);
    setFormOpen(true);
    setSaveError('');
    setSaveNotice('');
    window.setTimeout(() => document.getElementById('standup-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  }

  function cancelEditing() {
    setEditingEntry(null);
    setFormOpen(false);
    setSaveError('');
    setSaveNotice('');
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await window.VPData.remove(COLLECTIONS.entries, deleteTarget.id);
      setDeleteTarget(null);
      setEditingEntry(null);
      setFormOpen(true);
      await loadBoard();
      setSaveNotice('Your standup was deleted.');
    } catch (error) {
      setDeleteError(error?.message || 'We couldn’t delete this standup. Please retry.');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleAdminReset(event) {
    event.preventDefault();
    setAdminFormError('');
    setAdminNotice('');
    const normalizedEmail = adminEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setAdminFormError('Enter a valid account email.');
      return;
    }
    if (adminNewPassword.length < 8) {
      setAdminFormError('Use a temporary password with at least 8 characters.');
      return;
    }
    setAdminBusy(true);
    try {
      const result = await window.VPAuth.adminResetPassword(normalizedEmail, adminNewPassword);
      setAdminNotice(
        result?.emailSent
          ? `Password reset for ${result.email}. The new password was emailed.`
          : `Password reset for ${result?.email || normalizedEmail}, but the email could not be sent. Share it securely with the account owner.`,
      );
      setAdminEmail('');
      setAdminNewPassword('');
      const requests = await window.VPAuth.adminListResetRequests();
      setResetRequests(Array.isArray(requests) ? requests : []);
    } catch (error) {
      setAdminFormError(error?.message || 'The password could not be reset. Please try again.');
    } finally {
      setAdminBusy(false);
    }
  }

  async function signOut() {
    try {
      await window.VPAuth.logout();
    } finally {
      setSignedInUser(null);
      setEntries([]);
      setActiveView('board');
      setAuthError('');
      setAuthLoading(false);
    }
  }

  const styles = `
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f8f5; color: #202a28; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; background: #f7f8f5; }
    button, input, textarea { font: inherit; }
    button { cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: .62; }
    :focus-visible { outline: 3px solid #53b99b; outline-offset: 3px; }
    .app-shell { min-height: 100vh; }
    .page-width { width: min(100% - 32px, 1120px); margin: 0 auto; }
    .topbar { background: rgba(255,255,255,.9); border-bottom: 1px solid #e7ebe7; }
    .topbar-inner { min-height: 82px; display: flex; gap: 20px; align-items: center; justify-content: space-between; padding: 15px 0; }
    .brand { display:flex; gap: 12px; align-items: center; min-width:0; }
    .brand-mark { width: 42px; height: 42px; display:grid; place-items:center; color:#12684f; background:#dff4eb; border-radius:14px; flex:none; }
    .brand h1 { font-size: 18px; line-height:1.2; margin:0; letter-spacing:-.03em; font-weight:750; }
    .brand-subtitle { color:#76817d; font-size:12px; margin-top:4px; }
    .header-actions { display:flex; align-items:center; justify-content:flex-end; gap:12px; flex-wrap:wrap; }
    .identity { display:flex; align-items:center; gap:9px; padding-right: 10px; border-right:1px solid #e5eae6; }
    .avatar { width:34px; height:34px; border-radius:50%; display:grid; place-items:center; background:#e6f3ed; color:#236b55; font-size:13px; font-weight:750; }
    .identity-name { font-size:13px; font-weight:700; }
    .identity-role { display:block; color:#75807b; font-size:11px; text-transform:capitalize; margin-top:2px; }
    .content { padding: 32px 0 64px; }
    .page-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:22px; }
    .eyebrow { color:#31836a; text-transform:uppercase; letter-spacing:.1em; font-size:10px; font-weight:800; }
    .page-heading h2 { margin:5px 0 0; font-size:28px; line-height:1.15; letter-spacing:-.04em; }
    .muted { color:#75807b; }
    .small { font-size:13px; }
    .card { background:#fff; border:1px solid #e7ebe7; border-radius:18px; box-shadow:0 4px 18px rgba(28,50,41,.035); }
    .toolbar-card { padding:16px; display:grid; grid-template-columns: 1fr; gap:15px; margin-bottom:16px; }
    .date-row { display:flex; align-items:center; gap:8px; min-width:0; }
    .date-label { font-size:14px; font-weight:700; min-width:0; }
    .date-label span { display:block; color:#74817a; font-size:11px; font-weight:500; margin-top:3px; }
    .icon-button { width:38px; height:38px; flex:none; display:grid; place-items:center; color:#40514a; border:1px solid #e3e9e4; background:#fff; border-radius:11px; transition:background .16s,border-color .16s; }
    .icon-button:hover:not(:disabled) { background:#eff8f3; border-color:#b7ddca; }
    .date-picker { max-width: 145px; margin-left:auto; }
    .progress { display:flex; align-items:center; gap:9px; min-height:40px; flex-wrap:wrap; }
    .progress-pill { display:inline-flex; align-items:center; gap:6px; border-radius:999px; background:#edf7f1; color:#246b53; padding:8px 11px; font-size:12px; font-weight:700; }
    .progress-pill.pending { color:#82602a; background:#fbf3df; }
    .search-wrap { position:relative; width:100%; }
    .search-wrap input { padding-left:38px; }
    .search-icon { position:absolute; left:13px; top:50%; transform:translateY(-50%); color:#87928d; pointer-events:none; }
    .input, .textarea { width:100%; border:1px solid #dfe6e0; border-radius:11px; background:#fff; color:#26312d; padding:11px 12px; transition:border-color .15s,box-shadow .15s; }
    .input { min-height:43px; }
    .textarea { resize:vertical; min-height:92px; line-height:1.5; }
    .input:focus, .textarea:focus { outline:none; border-color:#53b99b; box-shadow:0 0 0 3px rgba(83,185,155,.13); }
    .form-label { display:block; font-size:13px; font-weight:700; margin:0 0 7px; }
    .required { color:#d57850; }
    .field-error { color:#b64d39; font-size:12px; margin-top:5px; }
    .board-layout { display:grid; grid-template-columns:minmax(0,1fr); gap:18px; align-items:start; }
    .form-card { padding:20px; }
    .form-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:15px; }
    .form-head h3 { font-size:17px; margin:0; letter-spacing:-.02em; }
    .form-head p { margin:5px 0 0; font-size:12px; color:#78837e; }
    .form-fields { display:grid; gap:14px; }
    .form-actions { display:flex; gap:9px; margin-top:16px; flex-wrap:wrap; }
    .button { min-height:41px; border:1px solid transparent; border-radius:11px; padding:9px 15px; font-size:13px; font-weight:700; transition:transform .15s,background .15s,border-color .15s; }
    .button:hover:not(:disabled) { transform:translateY(-1px); }
    .button-primary { color:#fff; background:#238463; box-shadow:0 3px 9px rgba(35,132,99,.14); }
    .button-primary:hover:not(:disabled) { background:#176d51; }
    .button-secondary { color:#40514a; background:#fff; border-color:#dfe6e0; }
    .button-secondary:hover:not(:disabled) { background:#f5f8f5; }
    .button-quiet { color:#31745b; background:transparent; border-color:transparent; padding:8px 10px; }
    .button-danger { color:#a84435; background:#fff7f4; border-color:#f0d5cf; }
    .text-button { color:#277a5d; border:0; background:transparent; padding:4px 0; font-size:12px; font-weight:700; text-decoration:underline; text-underline-offset:3px; }
    .entries-section { min-width:0; }
    .entries-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; margin:5px 0 12px; }
    .entries-heading h3 { margin:0; font-size:16px; letter-spacing:-.02em; }
    .entry-grid { display:grid; grid-template-columns:minmax(0,1fr); gap:12px; }
    .entry-card { padding:18px; transition:transform .16s,box-shadow .16s; }
    .entry-card:hover { transform:translateY(-2px); box-shadow:0 9px 24px rgba(28,50,41,.07); }
    .entry-top { display:flex; justify-content:space-between; align-items:center; gap:12px; border-bottom:1px solid #edf0ed; padding-bottom:13px; margin-bottom:14px; }
    .entry-person { display:flex; align-items:center; gap:10px; min-width:0; }
    .entry-person strong { display:block; font-size:14px; overflow-wrap:anywhere; }
    .you-tag { display:inline-block; margin-left:6px; padding:3px 7px; color:#28775d; background:#eaf6ef; font-size:10px; font-weight:750; border-radius:999px; vertical-align:middle; }
    .entry-actions { display:flex; align-items:center; gap:5px; flex:none; }
    .entry-actions button { padding:6px 7px; border:0; border-radius:8px; color:#347b61; background:transparent; font-size:12px; font-weight:700; }
    .entry-actions button:hover { background:#eef7f1; }
    .entry-actions .delete-link { color:#a94f40; }
    .update-block { margin-top:12px; }
    .update-label { display:flex; align-items:center; gap:7px; margin-bottom:4px; color:#708078; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.09em; }
    .update-copy { font-size:13px; line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere; }
    .blocker-label { color:#aa6940; }
    .no-blockers { display:inline-flex; align-items:center; padding:4px 8px; color:#64736b; background:#f0f4f0; border-radius:7px; font-size:12px; }
    .empty-state { padding:34px 20px; text-align:center; border:1px dashed #d6e1d9; border-radius:16px; background:rgba(255,255,255,.7); }
    .empty-icon { width:46px; height:46px; display:grid; place-items:center; margin:0 auto 13px; border-radius:15px; color:#28785b; background:#e7f4ec; }
    .empty-state h3 { margin:0 0 5px; font-size:15px; }
    .empty-state p { margin:0; color:#78837d; font-size:13px; line-height:1.5; }
    .inline-alert { padding:11px 13px; border-radius:11px; color:#934737; background:#fff3ef; border:1px solid #f1d8d1; font-size:13px; line-height:1.45; margin:0 0 13px; }
    .success-alert { padding:10px 12px; color:#267555; background:#edf8f1; border:1px solid #d5eddd; border-radius:10px; font-size:13px; margin:0 0 13px; animation:fade-in .2s ease-out; }
    .notice { padding:11px 13px; border-radius:10px; background:#edf7f1; color:#267555; font-size:13px; line-height:1.5; }
    .skeleton { min-height:150px; border-radius:16px; background:linear-gradient(90deg,#edf1ed 25%,#f7f9f6 45%,#edf1ed 65%); background-size:220% 100%; animation:shimmer 1.4s infinite; }
    .users-toolbar { display:flex; flex-direction:column; gap:14px; padding:17px; margin-bottom:14px; }
    .users-count { font-size:13px; font-weight:700; white-space:nowrap; }
    .user-list { display:grid; gap:10px; }
    .user-card { padding:16px; display:grid; gap:10px; }
    .user-name { font-size:14px; font-weight:750; }
    .user-meta { color:#75817b; font-size:12px; overflow-wrap:anywhere; }
    .role-badge { display:inline-flex; width:max-content; border-radius:999px; background:#eaf5ef; color:#277456; padding:5px 9px; font-size:10px; font-weight:800; text-transform:capitalize; }
    .admin-panel { padding:20px; margin-top:20px; }
    .admin-panel h3 { margin:0; font-size:17px; }
    .admin-intro { margin:5px 0 16px; color:#78837d; font-size:12px; line-height:1.5; }
    .admin-grid { display:grid; gap:14px; }
    .admin-box { border:1px solid #e8ede8; border-radius:14px; padding:15px; min-width:0; }
    .admin-box h4 { margin:0 0 12px; font-size:13px; }
    .account-list { display:grid; gap:8px; max-height:260px; overflow:auto; }
    .account-row { display:flex; justify-content:space-between; gap:10px; border-bottom:1px solid #eff2ef; padding:7px 0; font-size:12px; }
    .account-row:last-child { border-bottom:0; }
    .request-list { display:grid; gap:8px; margin-bottom:13px; }
    .request-item { background:#f6f8f6; border-radius:9px; padding:9px; font-size:12px; overflow-wrap:anywhere; }
    .admin-form { display:grid; gap:11px; }
    .signin-wrap { min-height:100vh; display:grid; place-items:center; padding:24px 16px; }
    .signin-card { width:min(100%,430px); padding:28px; }
    .signin-logo { width:52px; height:52px; display:grid; place-items:center; margin-bottom:18px; color:#12684f; background:#dff4eb; border-radius:17px; }
    .signin-card h1 { font-size:25px; letter-spacing:-.04em; margin:0; }
    .signin-card .intro { margin:8px 0 22px; color:#74817a; font-size:14px; line-height:1.55; }
    .signin-fields { display:grid; gap:14px; }
    .signin-footer { margin-top:15px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
    .loading-line { display:flex; align-items:center; gap:9px; color:#64736b; font-size:13px; }
    .spinner { width:16px; height:16px; border:2px solid #d8e8dd; border-top-color:#268061; border-radius:50%; animation:spin .8s linear infinite; }
    .modal-backdrop { position:fixed; inset:0; z-index:20; display:grid; place-items:center; padding:18px; background:rgba(28,39,34,.42); }
    .modal { width:min(100%,420px); padding:22px; box-shadow:0 18px 60px rgba(0,0,0,.17); }
    .modal h3 { margin:0 0 8px; font-size:18px; }
    .modal p { margin:0; color:#6e7a73; font-size:13px; line-height:1.55; }
    .modal-actions { display:flex; justify-content:flex-end; gap:9px; margin-top:20px; }
    .view-link { border:0; background:transparent; color:#31775d; padding:8px; border-radius:9px; font-size:12px; font-weight:750; }
    .view-link:hover { background:#eff7f1; }
    .view-link.active { background:#eaf5ef; }
    .plain-link { border:0; background:transparent; color:#65736b; font-size:12px; padding:6px; }
    @keyframes spin { to { transform:rotate(360deg); } }
    @keyframes shimmer { to { background-position:-220% 0; } }
    @keyframes fade-in { from { opacity:0; transform:translateY(3px); } to { opacity:1; transform:translateY(0); } }
    @media (min-width: 700px) {
      .page-width { width:min(100% - 48px, 1120px); }
      .toolbar-card { grid-template-columns:1fr auto; align-items:center; padding:16px 18px; }
      .search-wrap { grid-column:1 / -1; max-width:100%; }
      .board-layout { grid-template-columns:minmax(270px, 330px) minmax(0,1fr); gap:20px; }
      .form-card { position:sticky; top:18px; }
      .entry-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .users-toolbar { flex-direction:row; align-items:center; }
      .users-toolbar .search-wrap { max-width:400px; margin-left:auto; }
      .user-card { grid-template-columns:minmax(150px,1.2fr) minmax(160px,1.4fr) 100px minmax(120px,1fr); align-items:center; }
      .admin-grid { grid-template-columns:1fr 1fr; }
    }
    @media (min-width: 980px) {
      .toolbar-card { grid-template-columns:1fr auto minmax(220px,300px); }
      .search-wrap { grid-column:auto; }
      .content { padding-top:40px; }
    }
    @media (max-width: 560px) {
      .page-width { width:calc(100% - 28px); }
      .topbar-inner { align-items:flex-start; flex-direction:column; gap:12px; padding:14px 0; }
      .header-actions { width:100%; justify-content:space-between; }
      .identity { margin-right:auto; }
      .page-heading { align-items:flex-start; flex-direction:column; }
      .page-heading h2 { font-size:25px; }
      .content { padding-top:24px; }
      .form-card { padding:17px; }
      .signin-card { padding:23px; }
      .progress { gap:6px; }
      .progress-pill { padding:7px 9px; }
      .date-label { font-size:12px; }
      .date-picker { max-width:128px; }
    }
  `;

  if (authLoading) {
    return (
      <div className="signin-wrap">
        <style>{styles}</style>
        <section className="card signin-card" aria-live="polite">
          <div className="signin-logo"><BrandIcon /></div>
          <h1>Daily Standup</h1>
          <p className="intro">A calm, shared space to align on the work ahead.</p>
          <div className="loading-line"><span className="spinner" /> Checking your workspace…</div>
          {authError && <div className="inline-alert" style={{ marginTop: 16 }}>{authError}</div>}
          {authError && <button className="button button-secondary" onClick={initialize}>Try again</button>}
        </section>
      </div>
    );
  }

  if (!signedInUser) {
    return (
      <div className="signin-wrap">
        <style>{styles}</style>
        <section className="card signin-card">
          <div className="signin-logo"><BrandIcon /></div>
          <h1>Daily Standup</h1>
          <p className="intro">Share yesterday’s progress, today’s focus, and anything blocking your team.</p>
          {authError && <div className="inline-alert" role="alert">{authError}</div>}
          {!profiles.length && !authError && (
            <div className="notice" style={{ marginBottom: 16 }}>
              You’re first to the board. Your account will own the workspace.
            </div>
          )}
          {profiles.length > 0 && (
            <p className="muted small" style={{ margin: '0 0 16px' }}>Sign in or create your profile to join the team board.</p>
          )}
          <form className="signin-fields" onSubmit={handleContinue} noValidate>
            <div>
              <label className="form-label" htmlFor="signin-name">Your name</label>
              <input
                id="signin-name"
                className="input"
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="e.g. Alex Morgan"
                aria-invalid={Boolean(signInErrors.name)}
                aria-describedby={signInErrors.name ? 'signin-name-error' : undefined}
              />
              {signInErrors.name && <div id="signin-name-error" className="field-error">{signInErrors.name}</div>}
            </div>
            <div>
              <label className="form-label" htmlFor="signin-email">Email address</label>
              <input
                id="signin-email"
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                aria-invalid={Boolean(signInErrors.email)}
                aria-describedby={signInErrors.email ? 'signin-email-error' : undefined}
              />
              {signInErrors.email && <div id="signin-email-error" className="field-error">{signInErrors.email}</div>}
            </div>
            {resetMode && (
              <div>
                <label className="form-label" htmlFor="reset-password">Temporary password</label>
                <input
                  id="reset-password"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  aria-invalid={Boolean(signInErrors.password)}
                />
                {signInErrors.password && <div className="field-error">{signInErrors.password}</div>}
              </div>
            )}
            <button className="button button-primary" type="submit" disabled={signInBusy}>
              {signInBusy ? 'Joining workspace…' : 'Continue'}
            </button>
          </form>
          {resetNotice && <div className="notice" role="status" style={{ marginTop: 14 }}>{resetNotice}</div>}
          <div className="signin-footer">
            <button className="text-button" type="button" onClick={handleForgotPassword} disabled={requestBusy}>
              {requestBusy ? 'Sending…' : 'Forgot password?'}
            </button>
            <button
              className="plain-link"
              type="button"
              onClick={() => {
                setResetMode((value) => !value);
                setSignInErrors({});
                setResetPassword('');
              }}
            >
              {resetMode ? 'Use standard sign-in' : 'Use a reset password'}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 11, lineHeight: 1.5, margin: '18px 0 0' }}>
            Your name identifies your updates to the team. Roles are assigned automatically.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <style>{styles}</style>
      <header className="topbar">
        <div className="page-width topbar-inner">
          <div className="brand">
            <div className="brand-mark"><BrandIcon /></div>
            <div>
              <h1>Daily Standup</h1>
              <div className="brand-subtitle">{activeView === 'users' ? 'Workspace members' : formatDate(selectedDate)}</div>
            </div>
          </div>
          <div className="header-actions">
            <div className="identity">
              <div className="avatar" aria-hidden="true">{(signedInUser.name || signedInUser.email || '?').trim().charAt(0).toUpperCase()}</div>
              <div>
                <div className="identity-name">{signedInUser.name || signedInUser.email}</div>
                <span className="identity-role">{isOwner ? 'Owner' : 'Member'}</span>
              </div>
            </div>
            {isOwner && (
              <button
                className={`view-link ${activeView === 'users' ? 'active' : ''}`}
                type="button"
                onClick={() => setActiveView(activeView === 'users' ? 'board' : 'users')}
              >
                {activeView === 'users' ? 'Standup board' : 'Users'}
              </button>
            )}
            <button className="plain-link" type="button" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="page-width content">
        {activeView === 'users' && isOwner ? (
          <>
            <div className="page-heading">
              <div>
                <div className="eyebrow">Workspace</div>
                <h2>Users</h2>
                <p className="muted small" style={{ margin: '7px 0 0' }}>People with access to this standup board.</p>
              </div>
            </div>
            <section className="card users-toolbar" aria-label="Search workspace users">
              <div className="users-count">{userProfiles.length} {userProfiles.length === 1 ? 'user' : 'users'}</div>
              <div className="search-wrap">
                <span className="search-icon"><SearchIcon /></span>
                <input
                  className="input"
                  type="search"
                  aria-label="Search users by name or email"
                  placeholder="Search name or email"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                />
              </div>
              {userSearch && <button className="button button-secondary" type="button" onClick={() => setUserSearch('')}>Clear search</button>}
            </section>

            {usersStatus === 'loading' && (
              <div className="user-list" aria-label="Loading users">
                {[1, 2, 3].map((item) => <div className="skeleton" key={item} style={{ minHeight: 70 }} />)}
              </div>
            )}
            {usersStatus === 'error' && (
              <div className="empty-state">
                <h3>Users couldn’t be loaded</h3>
                <p>{usersError}</p>
                <button className="button button-secondary" style={{ marginTop: 14 }} onClick={loadUsers}>Retry</button>
              </div>
            )}
            {usersStatus === 'ready' && (() => {
              const filtered = userProfiles.filter((profile) => {
                const query = userSearch.trim().toLowerCase();
                return !query || `${profile.displayName || ''} ${profile.email || ''}`.toLowerCase().includes(query);
              });
              if (!userProfiles.length) {
                return <div className="empty-state"><h3>No users yet</h3><p>Profiles will appear here when people join the workspace.</p></div>;
              }
              if (!filtered.length) {
                return <div className="empty-state"><h3>No users match your search</h3><p>Try another name or email address.</p><button className="button button-secondary" style={{ marginTop: 14 }} onClick={() => setUserSearch('')}>Clear search</button></div>;
              }
              return (
                <div className="user-list">
                  {filtered.map((profile) => (
                    <article className="card user-card" key={profile.id || profile.userId}>
                      <div className="user-name">{profile.displayName || 'Unnamed member'}</div>
                      <div className="user-meta">{profile.email}</div>
                      <span className="role-badge">{profile.role || 'member'}</span>
                      <div className="user-meta">Joined {profile.createdAt ? formatDate(profile.createdAt.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                    </article>
                  ))}
                </div>
              );
            })()}

            <section className="card admin-panel">
              <h3>Account tools</h3>
              <p className="admin-intro">Owner-only account access and password recovery tools.</p>
              {adminError && <div className="inline-alert" role="alert">{adminError} <button className="text-button" type="button" onClick={loadUsers}>Retry</button></div>}
              <div className="admin-grid">
                <div className="admin-box">
                  <h4>Accounts ({adminAccounts.length})</h4>
                  {usersStatus === 'loading' ? <div className="loading-line"><span className="spinner" /> Loading accounts…</div> : (
                    <div className="account-list">
                      {adminAccounts.length ? adminAccounts.map((account) => (
                        <div className="account-row" key={account.id || account.email}>
                          <span>{account.name || account.displayName || account.email}</span>
                          <span className="muted">{account.email}</span>
                        </div>
                      )) : <span className="muted small">No account records to show.</span>}
                    </div>
                  )}
                </div>
                <div className="admin-box">
                  <h4>Pending password requests ({resetRequests.length})</h4>
                  {resetRequests.length ? (
                    <div className="request-list">
                      {resetRequests.map((request, index) => (
                        <div className="request-item" key={request.id || request.email || index}>
                          <strong>{request.email || request.userEmail || 'Account request'}</strong>
                          {request.createdAt && <span className="muted"> · {formatDate(String(request.createdAt).slice(0, 10), { month: 'short', day: 'numeric' })}</span>}
                        </div>
                      ))}
                    </div>
                  ) : <p className="muted small" style={{ margin: '0 0 13px' }}>No pending reset requests.</p>}
                  <form className="admin-form" onSubmit={handleAdminReset} noValidate>
                    <div>
                      <label className="form-label" htmlFor="admin-reset-email">Account email</label>
                      <input id="admin-reset-email" className="input" type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="admin-new-password">New temporary password</label>
                      <input id="admin-new-password" className="input" type="password" autoComplete="new-password" value={adminNewPassword} onChange={(event) => setAdminNewPassword(event.target.value)} />
                    </div>
                    {adminFormError && <div className="field-error" role="alert">{adminFormError}</div>}
                    {adminNotice && <div className="notice" role="status">{adminNotice}</div>}
                    <button className="button button-primary" type="submit" disabled={adminBusy}>{adminBusy ? 'Resetting…' : 'Reset password'}</button>
                  </form>
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <div className="eyebrow">Team check-in</div>
                <h2>Standup board</h2>
                <p className="muted small" style={{ margin: '7px 0 0' }}>A clear view of what’s moving and what needs attention.</p>
              </div>
            </div>

            <section className="card toolbar-card" aria-label="Standup date and progress">
              <div className="date-row">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Previous day"
                  onClick={() => changeDate(shiftDate(selectedDate, -1))}
                >
                  <Icon><path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>
                </button>
                <div className="date-label">
                  {formatDate(selectedDate, { weekday: 'short', month: 'short', day: 'numeric' })}
                  <span>{selectedDate === currentDate ? 'Today' : selectedDate === defaultDate ? 'Current workday' : 'Selected workday'}</span>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Next day"
                  disabled={selectedDate >= currentDate}
                  onClick={() => changeDate(shiftDate(selectedDate, 1))}
                >
                  <Icon><path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>
                </button>
                <label className="sr-only" htmlFor="date-picker">Select standup date</label>
                <input
                  id="date-picker"
                  className="input date-picker"
                  type="date"
                  value={selectedDate}
                  max={currentDate}
                  onChange={(event) => event.target.value && changeDate(event.target.value)}
                />
              </div>
              <div className="progress" aria-live="polite">
                {boardStatus === 'loading' ? (
                  <span className="loading-line"><span className="spinner" /> Loading progress…</span>
                ) : (
                  <>
                    <span className="progress-pill"><CheckIcon /> {selectedEntries.length} submitted</span>
                    <span className="progress-pill pending">{missingCount} yet to submit</span>
                  </>
                )}
              </div>
              <div className="search-wrap">
                <span className="search-icon"><SearchIcon /></span>
                <input
                  className="input"
                  type="search"
                  aria-label="Search entries by member name"
                  placeholder="Find a team member"
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                />
              </div>
            </section>

            {boardStatus === 'error' && (
              <div className="inline-alert" role="alert">
                {boardError} <button className="text-button" type="button" onClick={loadBoard}>Retry loading</button>
              </div>
            )}

            <div className="board-layout">
              {formOpen && boardStatus !== 'error' && (
                <EntryForm
                  key={`${selectedDate}-${editingEntry?.id || 'new'}`}
                  entry={editingEntry || ownEntry || null}
                  dateLabel={formatDate(selectedDate, { month: 'long', day: 'numeric', year: 'numeric' })}
                  saving={saveBusy}
                  error={saveError}
                  success={saveNotice}
                  onSubmit={handleSaveEntry}
                  onCancel={editingEntry || ownEntry ? cancelEditing : undefined}
                />
              )}
              <section className="entries-section" aria-labelledby="entries-heading">
                <div className="entries-heading">
                  <h3 id="entries-heading">Team updates</h3>
                  <span className="muted small">{boardStatus === 'ready' ? `${visibleEntries.length} shown` : 'Loading…'}</span>
                </div>
                {boardStatus === 'loading' && (
                  <div className="entry-grid" aria-label="Loading standup entries">
                    {[1, 2].map((item) => <div className="skeleton" key={item} />)}
                  </div>
                )}
                {boardStatus === 'ready' && selectedEntries.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-icon"><BrandIcon /></div>
                    <h3>No standups for this date yet</h3>
                    <p>Be the first to share an update. Your standup form is ready above.</p>
                  </div>
                )}
                {boardStatus === 'ready' && selectedEntries.length > 0 && visibleEntries.length === 0 && (
                  <div className="empty-state">
                    <h3>No members match “{memberSearch.trim()}”</h3>
                    <p>Try a different name, or clear the search to see all updates.</p>
                    <button className="button button-secondary" style={{ marginTop: 14 }} type="button" onClick={() => setMemberSearch('')}>Clear search</button>
                  </div>
                )}
                {boardStatus === 'ready' && visibleEntries.length > 0 && (
                  <div className="entry-grid">
                    {visibleEntries.map((entry) => {
                      const profile = profileById.get(entry.userId);
                      const name = profile?.displayName || entry.displayName || 'Team member';
                      const isMine = entry.userId === signedInUser.id;
                      return (
                        <EntryCard
                          key={entry.id}
                          entry={entry}
                          name={name}
                          isMine={isMine}
                          onEdit={() => startEditing(entry)}
                          onDelete={() => {
                            setDeleteTarget(entry);
                            setDeleteError('');
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="card modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <h3 id="delete-title">Delete this standup?</h3>
            <p>
              This will remove your update for <strong>{formatDate(deleteTarget.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</strong>.
              This action can’t be undone.
            </p>
            {deleteError && <div className="inline-alert" role="alert" style={{ marginTop: 13 }}>{deleteError}</div>}
            <div className="modal-actions">
              <button className="button button-secondary" type="button" disabled={deleteBusy} onClick={() => { setDeleteTarget(null); setDeleteError(''); }}>Cancel</button>
              <button className="button button-danger" type="button" disabled={deleteBusy} onClick={confirmDelete}>{deleteBusy ? 'Deleting…' : 'Delete standup'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function BrandIcon() {
  return (
    <Icon size={22}>
      <path d="M12 21c4.5-2.2 7-6.1 7-11.8C13.9 8.8 9.2 10 7 13.2c-1.4 2.1-1.4 4.7-.2 6.6 2.5-.1 4.4-1.1 5.8-2.8 1.4-1.7 2.4-3.6 3.2-5.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 21c1.5-3.5 4.2-6.1 8.2-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Icon>
  );
}

function SearchIcon() {
  return (
    <Icon size={17}>
      <circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="1.7" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Icon>
  );
}

function CheckIcon() {
  return (
    <Icon size={14}>
      <path d="m5 12 4.2 4.2L19 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

export default App;

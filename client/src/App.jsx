import React, { useState, useEffect, useCallback } from 'react';
const api = async (path, { method = 'GET', body, form } = {}) => {
  const h = {}, t = localStorage.getItem('token'); if (t) h.Authorization = 'Bearer ' + t; if (body) h['Content-Type'] = 'application/json';
  const res = await fetch('/api' + path, { method, headers: h, body: form || (body && JSON.stringify(body)) });
  const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'Request failed'); return j;
};
const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const Err = ({ e }) => e ? <div className="err" role="alert">{e}</div> : null;
function useAsync() { const [e, setE] = useState(''); const run = async fn => { setE(''); try { return await fn(); } catch (x) { setE(x.message); } }; return [e, run]; }

function Auth({ onAuth }) {
  const [mode, setMode] = useState('login'), [f, setF] = useState({ name: '', email: '', password: '' }), [e, run] = useAsync();
  const set = k => ev => setF({ ...f, [k]: ev.target.value });
  const submit = ev => { ev.preventDefault(); run(async () => { const r = await api('/auth/' + mode, { method: 'POST', body: f }); localStorage.setItem('token', r.token); onAuth(r.user); }); };
  return <form className="card auth stack" onSubmit={submit}><h1>SplitWise Pro</h1><p className="mute">Split bills, scan receipts, settle up.</p>
    {mode === 'register' && <input placeholder="Your name" value={f.name} onChange={set('name')} required />}
    <input type="email" placeholder="Email" value={f.email} onChange={set('email')} required />
    <input type="password" placeholder="Password (8+ characters)" value={f.password} onChange={set('password')} minLength={8} required />
    <Err e={e} /><button>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
    <button type="button" className="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'New here? Create account' : 'Have an account? Sign in'}</button></form>;
}

function Dashboard({ user, open, refreshUser }) {
  const [groups, setGroups] = useState([]), [name, setName] = useState(''), [rem, setRem] = useState([]), [e, run] = useAsync();
  const load = useCallback(() => run(async () => { setGroups(await api('/groups')); setRem(await api('/reminders')); }), []);
  useEffect(() => { load(); }, [load]);
  return <div className="stack"><Err e={e} />
    {rem.map(r => <div key={r._id} className="card row"><span><b>{r.from?.name}</b> in {r.group?.name}: {r.message} ({money(r.amount)})</span>
      <button className="ghost" onClick={() => api(`/reminders/${r._id}/read`, { method: 'POST' }).then(load)}>Dismiss</button></div>)}
    <div className="card"><h2>Your groups</h2>
      <form className="gap" style={{ margin: '12px 0' }} onSubmit={ev => { ev.preventDefault(); run(async () => { await api('/groups', { method: 'POST', body: { name } }); setName(''); load(); }); }}>
        <input style={{ flex: 1 }} placeholder="New group, e.g. Goa trip" value={name} onChange={ev => setName(ev.target.value)} required /><button>Create group</button></form>
      {!groups.length && <p className="mute">No groups yet. Create one to start splitting.</p>}
      {groups.map(g => <div className="row" key={g._id}><div><b>{g.name}</b><div className="mute">{g.members.map(m => m.name).join(', ')}</div></div><button className="ghost" onClick={() => open(g._id)}>Open</button></div>)}</div></div>;
}

function Group({ id, user }) {
  const [d, setD] = useState(null), [email, setEmail] = useState(''), [msg, setMsg] = useState(''), [show, setShow] = useState(false), [e, run] = useAsync();
  const load = useCallback(() => run(async () => setD(await api('/groups/' + id))), [id]); useEffect(() => { load(); }, [load]);
  if (!d) return <Err e={e} />;
  const nm = uid => d.group.members.find(m => m.id === uid || m._id === uid)?.name || 'Someone', mine = d.balances[user.id] || 0;
  const act = (fn) => run(async () => { await fn(); load(); });
  return <div className="stack"><Err e={e} />
    <div className="hero"><div><small>{d.group.name}</small><div className="big">{mine >= 0 ? `You're owed ${money(mine)}` : `You owe ${money(-mine)}`}</div></div>
      <div className="gap"><button onClick={() => setShow(true)}>Add expense</button></div></div>
    {msg && <div className="card">{msg}</div>}
    {show && <AddExpense group={d.group} user={user} onDone={() => { setShow(false); load(); }} onCancel={() => setShow(false)} />}
    <div className="grid"><div className="card"><h2>Settle up</h2>{!d.simplified.length && <p className="mute">Everyone is square.</p>}
      {d.simplified.map((s, i) => <div className="row" key={i}><span><b>{nm(s.from)}</b> pays <b>{nm(s.to)}</b> <span className="pos">{money(s.amount)}</span></span>
        <span className="gap">{s.from === user.id && <>
          <button onClick={() => act(() => api(`/groups/${id}/settle`, { method: 'POST', body: { to: s.to, amount: s.amount, method: 'wallet' } }))}>Pay from wallet</button>
          <button className="ghost" onClick={() => act(() => api(`/groups/${id}/settle`, { method: 'POST', body: { to: s.to, amount: s.amount, method: 'cash' } }))}>Paid cash</button></>}
          {s.to === user.id && <button className="ghost" onClick={() => act(async () => { await api(`/groups/${id}/remind`, { method: 'POST', body: { to: s.from, amount: s.amount } }); setMsg(`Reminder sent to ${nm(s.from)}.`); })}>Remind</button>}</span></div>)}</div>
      <div className="card"><h2>Members</h2>{d.group.members.map(m => <div className="row" key={m._id}><span>{m.name}<div className="mute">{m.email}</div></span>
        <span className={(d.balances[m._id] || 0) >= 0 ? 'pos' : 'neg'}>{money(d.balances[m._id] || 0)}</span></div>)}
        {d.group.pendingInvites?.map(p => <div className="row mute" key={p}>{p} (invited)</div>)}
        <form className="gap" onSubmit={ev => { ev.preventDefault(); act(async () => { const r = await api(`/groups/${id}/invite`, { method: 'POST', body: { email } }); setEmail(''); setMsg(r.status === 'added' ? 'Member added.' : 'Invite saved. They join automatically when they sign up.'); }); }}>
          <input style={{ flex: 1 }} type="email" placeholder="Invite by email" value={email} onChange={ev => setEmail(ev.target.value)} required /><button className="ghost">Invite</button></form></div></div>
    <div className="card"><h2>Expenses</h2>{!d.expenses.length && <p className="mute">No expenses yet. Add one or scan a receipt.</p>}
      {d.expenses.map(x => <div className="row" key={x._id}><div><b>{x.description}</b><div className="mute">{nm(x.paidBy)} paid · {x.splitType} · {new Date(x.date).toLocaleDateString()}</div></div>
        <span className="gap"><b>{money(x.amount)}</b><button className="danger" onClick={() => act(() => api('/expenses/' + x._id, { method: 'DELETE' }))}>Delete</button></span></div>)}</div></div>;
}

function AddExpense({ group, user, onDone, onCancel }) {
  const M = group.members, [f, setF] = useState({ description: '', amount: '', category: 'general', paidBy: user.id, splitType: 'equal' });
  const [parts, setParts] = useState(M.map(m => m._id)), [vals, setVals] = useState({}), [items, setItems] = useState([]), [busy, setBusy] = useState(false), [e, run] = useAsync();
  const set = k => ev => setF({ ...f, [k]: ev.target.value });
  const scan = ev => { const file = ev.target.files[0]; if (!file) return; setBusy(true); run(async () => {
    const fd = new FormData(); fd.append('receipt', file); const r = await api('/receipts/scan', { method: 'POST', form: fd });
    if (!r.items.length) throw new Error('No line items found. Try a clearer, well-lit photo.');
    const sum = r.items.reduce((a, i) => a + i.price, 0);
    setItems(r.items.map(i => ({ ...i, assignedTo: [] }))); setF(p => ({ ...p, splitType: 'items', category: 'food', description: p.description || 'Restaurant bill', amount: r.total || (sum + r.tax).toFixed(2) }));
  }).finally(() => setBusy(false)); };
  const toggle = (i, uid) => setItems(items.map((it, k) => k !== i ? it : { ...it, assignedTo: it.assignedTo.includes(uid) ? it.assignedTo.filter(x => x !== uid) : [...it.assignedTo, uid] }));
  const assignDiet = (diet, uid) => setItems(items.map(it => it.diet === diet ? { ...it, assignedTo: [uid] } : it));
  const submit = ev => { ev.preventDefault(); run(async () => {
    const body = { ...f, amount: Number(f.amount) };
    if (f.splitType === 'equal') body.participants = parts;
    if (f.splitType === 'exact' || f.splitType === 'percent') body.splits = M.filter(m => vals[m._id]).map(m => ({ user: m._id, value: Number(vals[m._id]) }));
    if (f.splitType === 'items') body.items = items.map(i => ({ name: i.name, price: Number(i.price), diet: i.diet, assignedTo: i.assignedTo }));
    await api(`/groups/${group._id}/expenses`, { method: 'POST', body }); onDone(); }); };
  return <form className="card stack" onSubmit={submit}><h2>Add expense</h2>
    <div className="gap"><label className="ghost" style={{ padding: '10px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>{busy ? 'Reading receipt…' : 'Scan receipt'}<input hidden type="file" accept="image/*" onChange={scan} disabled={busy} /></label>
      <span className="mute">Reads items, tax and veg / non-veg from a photo.</span></div>
    <div className="grid"><input placeholder="What was it for?" value={f.description} onChange={set('description')} required />
      <input type="number" step="0.01" min="0.01" placeholder="Total amount" value={f.amount} onChange={set('amount')} required />
      <select value={f.category} onChange={set('category')}>{['general', 'food', 'drinks', 'travel', 'stay', 'groceries', 'rent', 'fun'].map(c => <option key={c}>{c}</option>)}</select>
      <select value={f.paidBy} onChange={set('paidBy')}>{M.map(m => <option key={m._id} value={m._id}>{m.name} paid</option>)}</select>
      <select value={f.splitType} onChange={set('splitType')}><option value="equal">Split equally</option><option value="exact">Exact amounts</option><option value="percent">Percentages</option><option value="items">By item</option></select></div>
    {f.splitType === 'equal' && <div className="gap chips">{M.map(m => <label key={m._id}><input type="checkbox" checked={parts.includes(m._id)} onChange={() => setParts(parts.includes(m._id) ? parts.filter(x => x !== m._id) : [...parts, m._id])} />{m.name}</label>)}</div>}
    {(f.splitType === 'exact' || f.splitType === 'percent') && M.map(m => <div className="gap" key={m._id}><span style={{ width: 120 }}>{m.name}</span><input style={{ flex: 1 }} type="number" step="0.01" min="0" placeholder={f.splitType === 'exact' ? 'Amount' : '%'} value={vals[m._id] || ''} onChange={ev => setVals({ ...vals, [m._id]: ev.target.value })} /></div>)}
    {f.splitType === 'items' && <div className="stack">
      <div className="gap"><button type="button" className="ghost" onClick={() => setItems([...items, { name: '', price: 0, diet: 'unknown', assignedTo: [] }])}>Add item</button>
        {['veg', 'non-veg'].map(dt => <select key={dt} defaultValue="" onChange={ev => ev.target.value && assignDiet(dt, ev.target.value)} style={{ width: 'auto' }}><option value="">All {dt} items to…</option>{M.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}</select>)}</div>
      {items.map((it, i) => <div className="row" key={i} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}><div style={{ flex: '1 1 220px' }} className="stack">
        <div className="gap"><input style={{ flex: 1 }} value={it.name} placeholder="Item" onChange={ev => setItems(items.map((x, k) => k === i ? { ...x, name: ev.target.value } : x))} />
          <input style={{ width: 90 }} type="number" step="0.01" value={it.price} onChange={ev => setItems(items.map((x, k) => k === i ? { ...x, price: ev.target.value } : x))} /></div>
        <span className={'tag ' + it.diet}>{it.diet}</span></div>
        <div className="gap chips" style={{ flex: '1 1 220px' }}>{M.map(m => <label key={m._id}><input type="checkbox" checked={it.assignedTo.includes(m._id)} onChange={() => toggle(i, m._id)} />{m.name}</label>)}</div></div>)}
      <p className="mute">Tax and service charge (total minus items) are shared in proportion to each person's items.</p></div>}
    <Err e={e} /><div className="gap"><button>Save expense</button><button type="button" className="ghost" onClick={onCancel}>Cancel</button></div></form>;
}

function Wallet({ refreshUser }) {
  const [w, setW] = useState({ balance: 0, transactions: [] }), [amt, setAmt] = useState(''), [e, run] = useAsync();
  const load = () => run(async () => { setW(await api('/wallet')); refreshUser(); }); useEffect(() => { load(); }, []);
  return <div className="stack"><Err e={e} /><div className="hero"><div><small>Wallet balance</small><div className="big">{money(w.balance)}</div></div>
    <form className="gap" onSubmit={ev => { ev.preventDefault(); run(async () => { await api('/wallet/topup', { method: 'POST', body: { amount: Number(amt) } }); setAmt(''); load(); }); }}>
      <input style={{ width: 140 }} type="number" min="1" placeholder="Amount" value={amt} onChange={ev => setAmt(ev.target.value)} required /><button>Add money</button></form></div>
    <div className="card"><h2>Transactions</h2>{!w.transactions.length && <p className="mute">Nothing yet.</p>}
      {w.transactions.map(t => <div className="row" key={t._id}><div>{t.note}<div className="mute">{new Date(t.createdAt).toLocaleString()}</div></div><span className={t.type === 'settle_out' ? 'neg' : 'pos'}>{t.type === 'settle_out' ? '−' : '+'}{money(t.amount)}</span></div>)}</div></div>;
}

function Analytics() {
  const [a, setA] = useState(null), [e, run] = useAsync(); useEffect(() => { run(async () => setA(await api('/analytics'))); }, []);
  if (!a) return <Err e={e} />;
  const Bars = ({ rows }) => { const mx = Math.max(1, ...rows.map(r => r.total)); return rows.length ? rows.map(r => <div className="row" key={r.key}><span style={{ width: 90 }}>{r.key}</span><div style={{ flex: 1 }}><div className="bar" style={{ width: `${(r.total / mx) * 100}%` }} /></div><b>{money(r.total)}</b></div>) : <p className="mute">No data yet.</p>; };
  return <div className="stack"><div className="hero"><div><small>Your share of spending</small><div className="big">{money(a.totalShare)}</div></div><div><small>You paid upfront</small><div className="big">{money(a.totalPaid)}</div></div></div>
    <div className="grid"><div className="card"><h2>By category</h2><Bars rows={a.byCategory} /></div><div className="card"><h2>By month</h2><Bars rows={a.byMonth} /></div></div></div>;
}

export default function App() {
  const [user, setUser] = useState(null), [ready, setReady] = useState(false), [tab, setTab] = useState('home'), [gid, setGid] = useState(null);
  const refreshUser = () => api('/me').then(setUser).catch(() => {});
  useEffect(() => { api('/me').then(setUser).catch(() => localStorage.removeItem('token')).finally(() => setReady(true)); }, []);
  if (!ready) return null; if (!user) return <Auth onAuth={setUser} />;
  const go = t => { setTab(t); setGid(null); };
  return <div className="shell"><nav><b>SplitWise Pro</b>{[['home', 'Groups'], ['wallet', 'Wallet'], ['stats', 'Analytics']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)}>{l}</button>)}
    <button onClick={() => { localStorage.removeItem('token'); setUser(null); }}>Sign out ({user.name})</button></nav>
    {tab === 'home' && (gid ? <><button className="ghost" style={{ marginBottom: 12 }} onClick={() => setGid(null)}>Back to groups</button><Group id={gid} user={user} /></> : <Dashboard user={user} open={setGid} />)}
    {tab === 'wallet' && <Wallet refreshUser={refreshUser} />}{tab === 'stats' && <Analytics />}</div>;
}

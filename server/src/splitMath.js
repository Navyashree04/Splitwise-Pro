const c = n => Math.round(Number(n) * 100);
const bad = m => Object.assign(new Error(m), { status: 400 });
// Largest-remainder proration: integer cents that sum exactly to total
function prorate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) throw bad('Weights must not all be zero');
  const raw = weights.map(w => (total * w) / sum), out = raw.map(Math.floor);
  let rem = total - out.reduce((a, b) => a + b, 0);
  raw.map((x, i) => [x - out[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rem-- > 0) out[i]++; });
  return out;
}
const even = (total, ids) => prorate(total, ids.map(() => 1)).map((cents, i) => ({ user: ids[i], cents }));
function computeShares({ amount, splitType, participants = [], splits = [], items = [] }) {
  const total = c(amount); let rows;
  if (!(total > 0)) throw bad('Amount must be positive');
  if (splitType === 'equal') {
    if (!participants.length) throw bad('Pick at least one participant');
    rows = even(total, participants);
  } else if (splitType === 'exact') {
    rows = splits.map(s => ({ user: s.user, cents: c(s.value) }));
    if (rows.reduce((a, r) => a + r.cents, 0) !== total) throw bad('Exact amounts must add up to the total');
  } else if (splitType === 'percent') {
    if (Math.abs(splits.reduce((a, s) => a + Number(s.value), 0) - 100) > 0.01) throw bad('Percentages must add up to 100');
    rows = prorate(total, splits.map(s => Number(s.value))).map((cents, i) => ({ user: splits[i].user, cents }));
  } else if (splitType === 'items') {
    const itemsTotal = items.reduce((a, i) => a + c(i.price), 0), extra = total - itemsTotal;
    if (extra < 0) throw bad('Items add up to more than the bill total');
    const per = {};
    for (const it of items) {
      if (!it.assignedTo?.length) throw bad(`Assign "${it.name}" to at least one member`);
      even(c(it.price), it.assignedTo).forEach(r => (per[r.user] = (per[r.user] || 0) + r.cents));
    }
    const ids = Object.keys(per);
    if (!ids.length) throw bad('No items to split');
    const base = ids.map(id => per[id]);
    const tax = extra ? prorate(extra, base.every(x => x === 0) ? base.map(() => 1) : base) : base.map(() => 0);
    rows = ids.map((user, i) => ({ user, cents: base[i] + tax[i] }));
  } else throw bad('Unknown split type');
  const m = {};
  rows.forEach(r => (m[r.user] = (m[r.user] || 0) + r.cents));
  return Object.entries(m).filter(([, v]) => v > 0).map(([user, v]) => ({ user, amount: v / 100 }));
}
// net > 0 means the person is owed money
function netBalances(expenses, settlements = []) {
  const net = {}, add = (u, v) => (net[u] = (net[u] || 0) + v);
  for (const e of expenses) { add(String(e.paidBy), c(e.amount)); e.shares.forEach(s => add(String(s.user), -c(s.amount))); }
  for (const s of settlements) { add(String(s.from), c(s.amount)); add(String(s.to), -c(s.amount)); }
  return Object.fromEntries(Object.entries(net).map(([k, v]) => [k, v / 100]));
}
function simplify(net) {
  const cr = [], db = [], out = [];
  for (const [u, v] of Object.entries(net)) { const x = c(v); if (x > 0) cr.push([u, x]); else if (x < 0) db.push([u, -x]); }
  cr.sort((a, b) => b[1] - a[1]); db.sort((a, b) => b[1] - a[1]);
  let i = 0, j = 0;
  while (i < cr.length && j < db.length) {
    const amt = Math.min(cr[i][1], db[j][1]);
    out.push({ from: db[j][0], to: cr[i][0], amount: amt / 100 });
    cr[i][1] -= amt; db[j][1] -= amt;
    if (!cr[i][1]) i++; if (!db[j][1]) j++;
  }
  return out;
}
module.exports = { computeShares, netBalances, simplify, prorate };

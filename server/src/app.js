const express = require('express'), cors = require('cors'), helmet = require('helmet'), path = require('path'), fs = require('fs');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), multer = require('multer'), { z } = require('zod');
const M = require('./models'), { computeShares, netBalances, simplify } = require('./splitMath'), { parseReceipt } = require('./ocr');
const app = express(), upload = multer({ limits: { fileSize: 8e6 }, storage: multer.memoryStorage() });
app.use(helmet({ contentSecurityPolicy: false }), cors(), express.json({ limit: '1mb' }));
const SECRET = () => process.env.JWT_SECRET || 'dev-secret';
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (s, m) => Object.assign(new Error(m), { status: s });
const parse = (schema, body) => { const r = schema.safeParse(body); if (!r.success) throw fail(400, r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')); return r.data; };
const sign = u => jwt.sign({ id: u.id }, SECRET(), { expiresIn: '7d' });
const pub = u => ({ id: u.id, name: u.name, email: u.email, currency: u.currency, wallet: u.wallet });
const auth = wrap(async (req, _res, next) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  try { req.user = await M.User.findById(jwt.verify(t, SECRET()).id); } catch { /* handled below */ }
  if (!req.user) throw fail(401, 'Please sign in again'); next();
});
const myGroup = async (req) => {
  const g = await M.Group.findById(req.params.id).populate('members', 'name email').catch(() => null);
  if (!g || !g.members.some(m => m.id === req.user.id)) throw fail(404, 'Group not found');
  return g;
};
const r = express.Router();
r.post('/auth/register', wrap(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) }), req.body);
  if (await M.User.findOne({ email: b.email.toLowerCase() })) throw fail(409, 'Email already registered');
  const u = await M.User.create({ name: b.name, email: b.email, passwordHash: await bcrypt.hash(b.password, 10) });
  await M.Group.updateMany({ pendingInvites: u.email }, { $addToSet: { members: u._id }, $pull: { pendingInvites: u.email } });
  res.status(201).json({ token: sign(u), user: pub(u) });
}));
r.post('/auth/login', wrap(async (req, res) => {
  const b = parse(z.object({ email: z.string().email(), password: z.string() }), req.body);
  const u = await M.User.findOne({ email: b.email.toLowerCase() });
  if (!u || !(await bcrypt.compare(b.password, u.passwordHash))) throw fail(401, 'Wrong email or password');
  res.json({ token: sign(u), user: pub(u) });
}));
r.get('/me', auth, (req, res) => res.json(pub(req.user)));
r.put('/me', auth, wrap(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(1).optional(), currency: z.string().length(3).optional() }), req.body);
  Object.assign(req.user, b); await req.user.save(); res.json(pub(req.user));
}));
r.get('/groups', auth, wrap(async (req, res) => res.json(await M.Group.find({ members: req.user._id }).populate('members', 'name email').sort('-updatedAt'))));
r.post('/groups', auth, wrap(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(1).max(60) }), req.body);
  res.status(201).json(await M.Group.create({ name: b.name, members: [req.user._id], createdBy: req.user._id }));
}));
r.post('/groups/:id/invite', auth, wrap(async (req, res) => {
  const b = parse(z.object({ email: z.string().email() }), req.body), g = await myGroup(req), email = b.email.toLowerCase();
  const u = await M.User.findOne({ email });
  if (u) { if (g.members.some(m => m.id === u.id)) throw fail(409, 'Already a member'); await M.Group.updateOne({ _id: g._id }, { $addToSet: { members: u._id } }); }
  else await M.Group.updateOne({ _id: g._id }, { $addToSet: { pendingInvites: email } });
  res.json({ status: u ? 'added' : 'pending' });
}));
r.get('/groups/:id', auth, wrap(async (req, res) => {
  const g = await myGroup(req), [expenses, settlements] = await Promise.all([M.Expense.find({ group: g._id }).sort('-date'), M.Settlement.find({ group: g._id }).sort('-createdAt')]);
  const net = netBalances(expenses, settlements);
  res.json({ group: g, expenses, settlements, balances: net, simplified: simplify(net) });
}));
const expSchema = z.object({ description: z.string().min(1), amount: z.number().positive(), paidBy: z.string(), splitType: z.enum(['equal', 'exact', 'percent', 'items']),
  category: z.string().default('general'), participants: z.array(z.string()).optional(), splits: z.array(z.object({ user: z.string(), value: z.number() })).optional(),
  items: z.array(z.object({ name: z.string(), price: z.number().nonnegative(), diet: z.string().optional(), assignedTo: z.array(z.string()) })).optional() });
r.post('/groups/:id/expenses', auth, wrap(async (req, res) => {
  const g = await myGroup(req), b = parse(expSchema, req.body), ids = g.members.map(m => m.id);
  const used = [b.paidBy, ...(b.participants || []), ...(b.splits || []).map(s => s.user), ...(b.items || []).flatMap(i => i.assignedTo)];
  if (used.some(u => !ids.includes(u))) throw fail(400, 'Everyone in an expense must be a group member');
  const shares = computeShares(b);
  res.status(201).json(await M.Expense.create({ group: g._id, description: b.description, amount: b.amount, paidBy: b.paidBy, splitType: b.splitType, category: b.category, shares, items: b.items || [] }));
}));
r.delete('/expenses/:id', auth, wrap(async (req, res) => {
  const e = await M.Expense.findById(req.params.id).catch(() => null);
  if (!e || !(await M.Group.exists({ _id: e.group, members: req.user._id }))) throw fail(404, 'Expense not found');
  await e.deleteOne(); res.json({ ok: true });
}));
r.post('/groups/:id/settle', auth, wrap(async (req, res) => {
  const g = await myGroup(req), b = parse(z.object({ to: z.string(), amount: z.number().positive(), method: z.enum(['cash', 'wallet']) }), req.body);
  if (!g.members.some(m => m.id === b.to) || b.to === req.user.id) throw fail(400, 'Choose another group member');
  const amt = Math.round(b.amount * 100) / 100;
  if (b.method === 'wallet') {
    const to = await M.User.findById(b.to), debit = await M.User.findOneAndUpdate({ _id: req.user._id, wallet: { $gte: amt } }, { $inc: { wallet: -amt } }, { new: true });
    if (!debit) throw fail(400, 'Not enough wallet balance. Add money first.');
    const credit = await M.User.findByIdAndUpdate(to._id, { $inc: { wallet: amt } }, { new: true });
    await M.Transaction.create([{ user: req.user._id, type: 'settle_out', amount: amt, note: `Paid ${to.name}`, group: g._id, balanceAfter: debit.wallet },
      { user: to._id, type: 'settle_in', amount: amt, note: `Received from ${req.user.name}`, group: g._id, balanceAfter: credit.wallet }]);
  }
  res.status(201).json(await M.Settlement.create({ group: g._id, from: req.user._id, to: b.to, amount: amt, method: b.method }));
}));
r.get('/wallet', auth, wrap(async (req, res) => res.json({ balance: req.user.wallet, transactions: await M.Transaction.find({ user: req.user._id }).sort('-createdAt').limit(50) })));
r.post('/wallet/topup', auth, wrap(async (req, res) => {
  const b = parse(z.object({ amount: z.number().positive().max(100000) }), req.body);
  const u = await M.User.findByIdAndUpdate(req.user._id, { $inc: { wallet: b.amount } }, { new: true });
  await M.Transaction.create({ user: u._id, type: 'topup', amount: b.amount, note: 'Wallet top-up', balanceAfter: u.wallet }); res.json({ balance: u.wallet });
}));
r.post('/groups/:id/remind', auth, wrap(async (req, res) => {
  const g = await myGroup(req), b = parse(z.object({ to: z.string(), amount: z.number().positive(), message: z.string().max(200).optional() }), req.body);
  if (!g.members.some(m => m.id === b.to)) throw fail(400, 'Not a group member');
  res.status(201).json(await M.Reminder.create({ group: g._id, from: req.user._id, to: b.to, amount: b.amount, message: b.message || 'Friendly reminder to settle up' }));
}));
r.get('/reminders', auth, wrap(async (req, res) => res.json(await M.Reminder.find({ to: req.user._id, read: false }).populate('from', 'name').populate('group', 'name').sort('-createdAt'))));
r.post('/reminders/:id/read', auth, wrap(async (req, res) => { await M.Reminder.updateOne({ _id: req.params.id, to: req.user._id }, { read: true }); res.json({ ok: true }); }));
r.get('/analytics', auth, wrap(async (req, res) => {
  const gs = await M.Group.find({ members: req.user._id }).select('_id'), ex = await M.Expense.find({ group: { $in: gs.map(g => g._id) } }), me = req.user.id;
  const byCategory = {}, byMonth = {}; let paid = 0, share = 0;
  for (const e of ex) {
    const mine = e.shares.find(s => String(s.user) === me)?.amount || 0; if (String(e.paidBy) === me) paid += e.amount; share += mine;
    if (!mine) continue; byCategory[e.category] = (byCategory[e.category] || 0) + mine;
    const k = e.date.toISOString().slice(0, 7); byMonth[k] = (byMonth[k] || 0) + mine;
  }
  const rd = o => Object.entries(o).map(([k, v]) => ({ key: k, total: Math.round(v * 100) / 100 }));
  res.json({ totalPaid: paid, totalShare: share, byCategory: rd(byCategory), byMonth: rd(byMonth).sort((a, b) => a.key.localeCompare(b.key)) });
}));
r.post('/receipts/scan', auth, upload.single('receipt'), wrap(async (req, res) => {
  if (!req.file || !/^image\//.test(req.file.mimetype)) throw fail(400, 'Upload a receipt image (JPG or PNG)');
  res.json(await parseReceipt(req.file.buffer));
}));
app.use('/api', r);
app.get('/api/health', (_q, s) => s.json({ ok: true }));
const dist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get('*', (_q, s) => s.sendFile(path.join(dist, 'index.html'))); }
app.use((err, _req, res, _next) => {
  if (err.name === 'CastError') err.status = 400;
  if (err.code === 11000) err.status = 409;
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong on our side' });
});
module.exports = app;

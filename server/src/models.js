const { Schema, model } = require('mongoose');
const ref = n => ({ type: Schema.Types.ObjectId, ref: n, required: true });
const User = model('User', new Schema({ name: { type: String, required: true, trim: true }, email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true }, currency: { type: String, default: 'INR' }, wallet: { type: Number, default: 0 } }, { timestamps: true }));
const Group = model('Group', new Schema({ name: { type: String, required: true, trim: true }, members: [ref('User')], pendingInvites: [String], createdBy: ref('User') }, { timestamps: true }));
const Expense = model('Expense', new Schema({ group: ref('Group'), description: { type: String, required: true }, amount: { type: Number, required: true }, paidBy: ref('User'),
  splitType: String, category: { type: String, default: 'general' }, date: { type: Date, default: Date.now },
  shares: [{ user: ref('User'), amount: Number, _id: false }], items: [{ name: String, price: Number, diet: String, assignedTo: [String], _id: false }] }, { timestamps: true }));
const Settlement = model('Settlement', new Schema({ group: ref('Group'), from: ref('User'), to: ref('User'), amount: Number, method: { type: String, enum: ['cash', 'wallet'] } }, { timestamps: true }));
const Transaction = model('Transaction', new Schema({ user: ref('User'), type: { type: String, enum: ['topup', 'settle_out', 'settle_in'] }, amount: Number, note: String, group: { type: Schema.Types.ObjectId, ref: 'Group' }, balanceAfter: Number }, { timestamps: true }));
const Reminder = model('Reminder', new Schema({ group: ref('Group'), from: ref('User'), to: ref('User'), amount: Number, message: String, read: { type: Boolean, default: false } }, { timestamps: true }));
module.exports = { User, Group, Expense, Settlement, Transaction, Reminder };

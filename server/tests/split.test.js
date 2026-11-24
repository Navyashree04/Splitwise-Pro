const { computeShares, netBalances, simplify } = require('../src/splitMath');
const sum = r => Math.round(r.reduce((a, x) => a + x.amount, 0) * 100) / 100;
test('equal split distributes remainder', () => {
  const r = computeShares({ amount: 100, splitType: 'equal', participants: ['a', 'b', 'c'] });
  expect(sum(r)).toBe(100); expect(r.map(x => x.amount).sort()).toEqual([33.33, 33.33, 33.34]);
});
test('exact split validates total', () => {
  expect(() => computeShares({ amount: 50, splitType: 'exact', splits: [{ user: 'a', value: 20 }, { user: 'b', value: 20 }] })).toThrow(/add up/);
  expect(sum(computeShares({ amount: 50, splitType: 'exact', splits: [{ user: 'a', value: 20 }, { user: 'b', value: 30 }] }))).toBe(50);
});
test('percent split', () => {
  const r = computeShares({ amount: 200, splitType: 'percent', splits: [{ user: 'a', value: 70 }, { user: 'b', value: 30 }] });
  expect(r).toEqual([{ user: 'a', amount: 140 }, { user: 'b', amount: 60 }]);
  expect(() => computeShares({ amount: 10, splitType: 'percent', splits: [{ user: 'a', value: 50 }] })).toThrow();
});
test('item split shares tax proportionally and sums exactly', () => {
  const items = [{ name: 'Paneer', price: 200, assignedTo: ['a'] }, { name: 'Chicken', price: 300, assignedTo: ['b'] }, { name: 'Naan', price: 100, assignedTo: ['a', 'b'] }];
  const r = computeShares({ amount: 630, splitType: 'items', items });
  expect(sum(r)).toBe(630);
  expect(r.find(x => x.user === 'a').amount).toBe(262.5); expect(r.find(x => x.user === 'b').amount).toBe(367.5);
  expect(() => computeShares({ amount: 630, splitType: 'items', items: [{ name: 'x', price: 1, assignedTo: [] }] })).toThrow(/Assign/);
});
test('balances and debt simplification', () => {
  const ex = [{ paidBy: 'a', amount: 90, shares: [{ user: 'a', amount: 30 }, { user: 'b', amount: 30 }, { user: 'c', amount: 30 }] },
    { paidBy: 'b', amount: 60, shares: [{ user: 'a', amount: 20 }, { user: 'b', amount: 20 }, { user: 'c', amount: 20 }] }];
  const net = netBalances(ex);
  expect(net).toEqual({ a: 40, b: 10, c: -50 });
  expect(simplify(net)).toEqual([{ from: 'c', to: 'a', amount: 40 }, { from: 'c', to: 'b', amount: 10 }]);
  expect(netBalances(ex, [{ from: 'c', to: 'a', amount: 40 }]).a).toBe(0);
});

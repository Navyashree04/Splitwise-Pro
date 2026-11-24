const DIET_NON = /chicken|mutton|lamb|beef|pork|fish|prawn|shrimp|egg|bacon|ham\b|sausage|kebab|salmon|tuna|crab|meat|keema/i;
const DIET_VEG = /paneer|veg|dal|aloo|gobi|salad|naan|roti|rice|fries|cheese|mushroom|tofu|dosa|idli|samosa|juice|coffee|tea|cake|ice\s*cream/i;
const DRINK = /juice|coffee|tea|soda|cola|beer|wine|water|lassi|shake|cocktail/i;
const diet = n => (DIET_NON.test(n) ? 'non-veg' : DIET_VEG.test(n) ? 'veg' : 'unknown');
const category = n => (DRINK.test(n) ? 'drinks' : 'food');
function heuristicParse(text) {
  const items = []; let tax = 0, total = null;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.trim().match(/^(.+?)\s+[^\d\s]{0,3}\s*(\d{1,6}(?:[.,]\d{2}))$/);
    if (!m) continue;
    const name = m[1].replace(/^\d+\s*[xX]?\s+/, '').trim(), price = parseFloat(m[2].replace(',', '.'));
    if (/sub\s*-?total/i.test(name)) continue;
    if (/grand\s*total|^total|amount due|net payable/i.test(name)) { total = price; continue; }
    if (/tax|gst|vat|cgst|sgst|service|charge|tip/i.test(name)) { tax += price; continue; }
    if (name.length > 1 && price > 0) items.push({ name, price, diet: diet(name), category: category(name) });
  }
  return { items, tax: Math.round(tax * 100) / 100, total, parser: 'heuristic' };
}
async function llmParse(text) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 2000,
      messages: [{ role: 'user', content: `Extract this restaurant receipt OCR text. Reply with JSON only: {"items":[{"name":string,"price":number (line total),"diet":"veg"|"non-veg"|"unknown","category":"food"|"drinks"|"other"}],"tax":number (all taxes+service charges combined),"total":number|null}. Fix obvious OCR typos in names. Eggs count as non-veg.\n\n${text}` }],
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const j = await res.json(), raw = j.content.map(b => b.text || '').join('');
  const p = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  return { items: p.items.filter(i => i.price > 0), tax: p.tax || 0, total: p.total ?? null, parser: 'llm' };
}
async function ocrText(buffer) {
  const { createWorker } = require('tesseract.js');
  const w = await createWorker('eng');
  try { return (await w.recognize(buffer)).data.text; } finally { await w.terminate(); }
}
async function parseReceipt(buffer) {
  const text = await ocrText(buffer);
  let out;
  if (process.env.ANTHROPIC_API_KEY) { try { out = await llmParse(text); } catch (e) { console.warn('LLM parse failed, using fallback:', e.message); } }
  return { ...(out || heuristicParse(text)), text };
}
module.exports = { parseReceipt, heuristicParse, diet };

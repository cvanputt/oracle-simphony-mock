import express from 'express';
import fs from 'fs';

const app = express();
app.use(express.json());

// simple JSON file "datastore"
const DB = '/app/data/simphony.json';
function load() {
  try { return JSON.parse(fs.readFileSync(DB, 'utf8') || '{}'); }
  catch { return {}; }
}
function save(db) {
  fs.writeFileSync(DB, JSON.stringify(db, null, 2));
}

// priced catalog for quick totals (keep in sync with menu mock)
const price = { 'RS-BURGER': 14.0, 'RS-CHEESE': 15.0, 'RS-FRIES': 5.0, 'RS-SALAD': 6.0 };
const TAX = 0.09, SVC = 0.10;

// create check
app.post('/sts/v2/checks', (req, res) => {
  const db = load(); db.checks ||= {};
  const checkId = 'CHK-' + Math.floor(1000 + Math.random() * 9000);
  db.checks[checkId] = { checkId, status: 'OPEN', items: [], subtotal: 0, tax: 0, service: 0, total: 0 };
  save(db);
  res.status(201).json(db.checks[checkId]);
});

// add items to check
app.post('/sts/v2/checks/:checkId/items', (req, res) => {
  const { checkId } = req.params;
  const { items = [] } = req.body || {};
  const db = load();
  const check = db.checks?.[checkId];
  if (!check) return res.status(404).json({ error: 'check not found' });

  items.forEach(({ sku, qty = 1 }) => { check.items.push({ sku, qty }); });

  const subtotal = check.items.reduce((s, i) => s + (price[i.sku] || 0) * i.qty, 0);
  check.subtotal = +subtotal.toFixed(2);
  check.tax = +(subtotal * TAX).toFixed(2);
  check.service = +(subtotal * SVC).toFixed(2);
  check.total = +(subtotal + check.tax + check.service).toFixed(2);
  save(db);
  res.json(check);
});

// tender (ROOM_CHARGE) with env-driven trx code and optional auto-post to OPERA
app.post('/sts/v2/checks/:checkId/tenders', async (req, res) => {
  const { checkId } = req.params;

  const defaultTxCode = process.env.SIMPHONY_TRANSACTION_CODE || 'ROOM_SERVICE';
  const {
    type,
    roomNumber,
    lastName,
    transactionCode // optional per-request override
  } = req.body || {};
  const trxCodeToUse = transactionCode || defaultTxCode;

  const db = load();
  const check = db.checks?.[checkId];
  if (!check) return res.status(404).json({ error: 'check not found' });

  if (type !== 'ROOM_CHARGE' || !roomNumber || !lastName) {
    return res.status(400).json({ error: 'require type=ROOM_CHARGE, roomNumber, lastName' });
  }

  const autoPost = String(process.env.SIMPHONY_AUTO_POST ?? 'true').toLowerCase() === 'true';

  try {
    let reservationId = null, postingId = null;

    if (autoPost) {
      // 1) OPERA guest lookup
      const qs = new URLSearchParams({ room: String(roomNumber), lastName: String(lastName) }).toString();
      const guestResp = await fetch(`http://opera-state:5000/opera/v1/guests?${qs}`);
      if (!guestResp.ok) return res.status(409).json({ error: 'guest not found or not in-house (OPERA lookup failed)' });
      const guest = await guestResp.json();
      reservationId = guest.reservationId;

      // 2) Post folio charge with chosen transaction code
      const postResp = await fetch(`http://opera-state:5000/opera/v1/folios/${encodeURIComponent(reservationId)}/charges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: check.total, transactionCode: trxCodeToUse })
      });
      if (!postResp.ok) return res.status(502).json({ error: 'OPERA folio posting failed', details: await postResp.text() });
      const posting = await postResp.json();
      postingId = posting.postingId;
    }

    // 3) Close the check and persist
    check.status = 'CLOSED';
    save(db);

    res.status(202).json({
      checkId,
      status: 'CLOSED',
      postedToOpera: autoPost,
      postingId,
      reservationId,
      transactionCode: trxCodeToUse,
      total: check.total
    });
  } catch (e) {
    res.status(500).json({ error: 'tender processing error', details: String(e) });
  }
});

// get check
app.get('/sts/v2/checks/:checkId', (req, res) => {
  const { checkId } = req.params;
  const db = load();
  const check = db.checks?.[checkId];
  if (!check) return res.status(404).json({ error: 'check not found' });
  res.json(check);
});

app.listen(5000, () => console.log('simphony-state listening on 5000'));

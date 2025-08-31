const express = require('express');
const fs = require('fs');

const app = express();
app.use(express.json());

// Ensure all responses are JSON
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// simple JSON file "datastore"
const DB = process.env.TEST_DB_PATH || '/app/data/simphony.json';
function load() {
  try {
    return JSON.parse(fs.readFileSync(DB, 'utf8') || '{}');
  } catch {
    return {};
  }
}
function save(db) {
  fs.writeFileSync(DB, JSON.stringify(db, null, 2));
}

// priced catalog for quick totals (keep in sync with menu mock)
const price = {
  'RS-BURGER': 14.0,
  'RS-CHEESE': 15.0,
  'RS-FRIES': 5.0,
  'RS-SALAD': 6.0,
};
const TAX = 0.09,
  SVC = 0.1;

// get all checks
app.get('/checks', (req, res) => {
  const db = load();
  let checks = Object.values(db.checks || {});

  // Handle query parameters for filtering
  const {
    checkEmployeeRef,
    checkNumbers,
    includeClosed,
    orderTypeRef,
    sinceTime,
    tableName,
  } = req.query;

  // Filter by employee reference
  if (checkEmployeeRef) {
    const employeeRef = parseInt(checkEmployeeRef);
    if (!isNaN(employeeRef)) {
      checks = checks.filter((check) => check.employeeRef === employeeRef);
    }
  }

  // Filter by check numbers
  if (checkNumbers) {
    const numbers = Array.isArray(checkNumbers) ? checkNumbers : [checkNumbers];
    const validNumbers = numbers
      .map((n) => parseInt(n))
      .filter((n) => !isNaN(n));
    if (validNumbers.length > 0) {
      checks = checks.filter((check) =>
        validNumbers.includes(check.checkNumber)
      );
    }
  }

  // Filter by includeClosed (default to true if not specified)
  if (includeClosed === 'false') {
    checks = checks.filter((check) => check.status !== 'CLOSED');
  }

  // Filter by order type reference
  if (orderTypeRef) {
    const orderType = parseInt(orderTypeRef);
    if (!isNaN(orderType)) {
      checks = checks.filter((check) => check.orderTypeRef === orderType);
    }
  }

  // Filter by since time
  if (sinceTime) {
    const sinceDate = new Date(sinceTime);
    if (!isNaN(sinceDate.getTime())) {
      checks = checks.filter((check) => {
        const checkTime = new Date(check.createdTime);
        return checkTime >= sinceDate;
      });
    }
  }

  // Filter by table name
  if (tableName) {
    checks = checks.filter((check) => check.tableName === tableName);
  }

  res.json(checks);
});

// create check
app.post('/checks', (req, res) => {
  const db = load();
  db.checks ||= {};
  const checkId = 'CHK-' + Math.floor(1000 + Math.random() * 9000);
  const checkNumber = Math.floor(1000 + Math.random() * 9000);

  db.checks[checkId] = {
    checkId,
    checkNumber,
    tableName:
      req.body.tableName || `Table ${Math.floor(Math.random() * 20) + 1}`,
    employeeRef: req.body.employeeRef || Math.floor(Math.random() * 100) + 100,
    orderTypeRef: req.body.orderTypeRef || 1,
    status: 'OPEN',
    createdTime: new Date().toISOString(),
    items: [],
    subtotal: 0,
    tax: 0,
    service: 0,
    total: 0,
  };
  save(db);
  res.status(201).json(db.checks[checkId]);
});

// add items to check
app.post('/checks/:checkId/items', (req, res) => {
  const {checkId} = req.params;
  const {items = []} = req.body || {};
  const db = load();
  const check = db.checks?.[checkId];
  if (!check) return res.status(404).json({error: 'check not found'});

  items.forEach(({sku, qty = 1}) => {
    check.items.push({sku, qty});
  });

  const subtotal = check.items.reduce(
    (s, i) => s + (price[i.sku] || 0) * i.qty,
    0
  );
  check.subtotal = +subtotal.toFixed(2);
  check.tax = +(subtotal * TAX).toFixed(2);
  check.service = +(subtotal * SVC).toFixed(2);
  check.total = +(subtotal + check.tax + check.service).toFixed(2);
  save(db);
  res.json(check);
});

// tender (ROOM_CHARGE) with env-driven trx code and optional auto-post to OPERA
app.post('/checks/:checkId/tenders', async (req, res) => {
  const {checkId} = req.params;

  const defaultTxCode = process.env.SIMPHONY_TRANSACTION_CODE || 'ROOM_SERVICE';
  const {
    type,
    roomNumber,
    lastName,
    transactionCode, // optional per-request override
  } = req.body || {};
  const trxCodeToUse = transactionCode || defaultTxCode;

  const db = load();
  const check = db.checks?.[checkId];
  if (!check) return res.status(404).json({error: 'check not found'});

  if (check.status === 'CLOSED') {
    return res.status(409).json({error: 'check is already closed'});
  }

  if (type !== 'ROOM_CHARGE' || !roomNumber || !lastName) {
    return res
      .status(400)
      .json({error: 'require type=ROOM_CHARGE, roomNumber, lastName'});
  }

  const autoPost =
    String(process.env.SIMPHONY_AUTO_POST ?? 'true').toLowerCase() === 'true';

  try {
    let reservationId = null,
      postingId = null;

    if (autoPost) {
      // 1) OPERA guest lookup
      const qs = new URLSearchParams({
        room: String(roomNumber),
        lastName: String(lastName),
      }).toString();
      const guestResp = await fetch(
        `http://opera-state:5000/opera/v1/guests?${qs}`
      );
      if (!guestResp.ok)
        return res.status(409).json({
          error: 'guest not found or not in-house (OPERA lookup failed)',
        });
      const guest = await guestResp.json();
      reservationId = guest.reservationId;

      // 2) Post folio charge with chosen transaction code
      const postResp = await fetch(
        `http://opera-state:5000/opera/v1/folios/${encodeURIComponent(
          reservationId
        )}/charges`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            amount: check.total,
            transactionCode: trxCodeToUse,
          }),
        }
      );
      if (!postResp.ok)
        return res.status(502).json({
          error: 'OPERA folio posting failed',
          details: await postResp.text(),
        });
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
      total: check.total,
    });
  } catch (e) {
    res
      .status(500)
      .json({error: 'tender processing error', details: String(e)});
  }
});

// get check
app.get('/checks/:checkId', (req, res) => {
  const {checkId} = req.params;
  const db = load();
  const check = db.checks?.[checkId];
  if (!check) {
    res.status(404).json({error: 'check not found'});
    return;
  }
  res.json(check);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({error: 'internal server error'});
});

// 404 handler for unmatched routes (must be last)
app.use((req, res) => {
  res.status(404).json({error: 'endpoint not found'});
});

// Only start the server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(5000, () => console.log('simphony-state listening on 5000'));
}

module.exports = app;

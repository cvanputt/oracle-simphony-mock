const express = require('express');
const fs = require('fs');

const app = express();
app.use(express.json());

// Ensure all responses are JSON
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Validation middleware for required Simphony headers
const validateSimphonyHeaders = (req, res, next) => {
  const requiredHeaders = [
    'Simphony-LocRef',
    'Simphony-OrgShortName',
    'Simphony-RvcRef',
  ];

  const missingHeaders = requiredHeaders.filter(
    (header) => !req.headers[header.toLowerCase()]
  );

  if (missingHeaders.length > 0) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Missing required headers: ${missingHeaders.join(', ')}`,
      code: 'MISSING_HEADERS',
    });
  }

  // Validate Simphony-RvcRef is an integer
  const rvcRef = req.headers['simphony-rvcref'];
  if (isNaN(parseInt(rvcRef))) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Simphony-RvcRef must be an integer',
      code: 'INVALID_RVCREF',
    });
  }

  next();
};

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

const calculateTotals = (body) => {
  const totals = {
    subtotal: 0,
    subtotalDiscountTotal: 0,
    autoServiceChargeTotal: 0,
    serviceChargeTotal: 0,
    taxTotal: 0,
    paymentTotal: 0,
    totalDue: 0,
  };

  body.menuItems.forEach((item) => {
    totals.subtotal += item.total;
    totals.taxTotal += item.taxTotal;
    totals.serviceChargeTotal += item.serviceChargeTotal;
    totals.totalDue += item.total;
  });
  return totals;
};

// get all checks
app.get('/checks', validateSimphonyHeaders, (req, res) => {
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
      checks = checks.filter(
        (check) => check.header.checkEmployeeRef === employeeRef
      );
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
        validNumbers.includes(check.header.checkNumber)
      );
    }
  }

  // Filter by includeClosed (default to true if not specified)
  if (includeClosed === 'false') {
    checks = checks.filter((check) => check.header.status !== 'closed');
  }

  // Filter by order type reference
  if (orderTypeRef) {
    const orderType = parseInt(orderTypeRef);
    if (!isNaN(orderType)) {
      checks = checks.filter(
        (check) => check.header.orderTypeRef === orderType
      );
    }
  }

  // Filter by since time
  if (sinceTime) {
    const sinceDate = new Date(sinceTime);
    if (!isNaN(sinceDate.getTime())) {
      checks = checks.filter((check) => {
        const checkTime = new Date(check.header.openTime);
        return checkTime >= sinceDate;
      });
    }
  }

  // Filter by table name
  if (tableName) {
    checks = checks.filter((check) => check.header.tableName === tableName);
  }

  res.json(checks);
});

// create check
app.post('/checks', validateSimphonyHeaders, (req, res) => {
  const db = load();
  db.checks ||= {};
  const checkId = 'CHK-' + Math.floor(1000 + Math.random() * 9000);
  const checkNumber = Math.floor(1000 + Math.random() * 9000);

  const calculatedTotals = calculateTotals(req.body);

  // Create response in Simphony Gen2 API format
  const checkResponse = {
    header: {
      orgShortName: req.headers['simphony-orgshortname'] || 'TEST_ORG',
      locRef: req.headers['simphony-locref'] || 'TEST_LOC',
      rvcRef: parseInt(req.headers['simphony-rvcref']) || 1,
      checkRef: checkId,
      idempotencyId: req.body.header?.idempotencyId || `idemp-${Date.now()}`,
      checkNumber: checkNumber,
      checkName: req.body.header?.checkName || `Check ${checkNumber}`,
      checkEmployeeRef: req.body.header?.checkEmployeeRef || 1,
      orderTypeRef: req.body.header?.orderTypeRef || 1,
      tableName:
        req.body.header?.tableName ||
        `Table ${Math.floor(Math.random() * 20) + 1}`,
      guestCount: req.body.header?.guestCount || 1,
      openTime: new Date().toISOString(),
      status: 'open',
      preparationStatus: 'Uninitialized',
    },
    menuItems: req.body.menuItems || [],
    comboMeals: req.body.comboMeals || [],
    discounts: req.body.discounts || [],
    serviceCharges: req.body.serviceCharges || [],
    extensions: req.body.extensions || [],
    taxes: req.body.taxes || [],
    tenders: req.body.tenders || [],
    checkPrintedLines: {
      lines: [
        `${checkNumber} STS                            Page 1`,
        '----------------------------------------',
        `CHK ${checkNumber}                           TBL ${
          req.body.header?.tableName || '1'
        }`,
        `               ${new Date().toLocaleDateString()}                `,
        '----------------------------------------',
        '       DineIn                           ',
        '  ----------- Check Open -----------  ',
        `           ${new Date().toLocaleString()}            `,
      ],
    },
    totals: {
      subtotal: calculatedTotals.subtotal,
      subtotalDiscountTotal: calculatedTotals.subtotalDiscountTotal,
      autoServiceChargeTotal: calculatedTotals.autoServiceChargeTotal,
      serviceChargeTotal: calculatedTotals.serviceChargeTotal,
      taxTotal: calculatedTotals.taxTotal,
      paymentTotal: calculatedTotals.paymentTotal,
      totalDue: calculatedTotals.totalDue,
    },
  };

  // Store in Simphony Gen2 API format
  db.checks[checkId] = checkResponse;

  save(db);
  res.status(201).json(checkResponse);
});

// add items to check
app.post('/checks/:checkId/items', validateSimphonyHeaders, (req, res) => {
  const {checkId} = req.params;
  const {items = []} = req.body || {};
  const db = load();
  const check = db.checks?.[checkId];
  if (!check) return res.status(404).json({error: 'check not found'});

  // Add items to menuItems array
  items.forEach(({sku, qty = 1}) => {
    check.menuItems.push({
      menuItemId: parseInt(sku.replace('RS-', '')),
      quantity: qty,
      unitPrice: price[sku] || 0,
      total: (price[sku] || 0) * qty,
    });
  });

  // Recalculate totals
  const subtotal = check.menuItems.reduce((s, i) => s + (i.total || 0), 0);
  check.totals.subtotal = +subtotal.toFixed(2);
  check.totals.taxTotal = +(subtotal * TAX).toFixed(2);
  check.totals.serviceChargeTotal = +(subtotal * SVC).toFixed(2);
  check.totals.totalDue = +(
    subtotal +
    check.totals.taxTotal +
    check.totals.serviceChargeTotal
  ).toFixed(2);

  // Update checkPrintedLines
  check.checkPrintedLines.lines = [
    `${check.header.checkNumber} STS                            Page 1`,
    '----------------------------------------',
    `CHK ${check.header.checkNumber}                           TBL ${check.header.tableName}`,
    `               ${new Date().toLocaleDateString()}                `,
    '----------------------------------------',
    '       DineIn                           ',
    ...check.menuItems.map(
      (item) =>
        ` ${item.quantity} Item ${item.menuItemId}               ${item.total}      `
    ),
    `   Subtotal                $${check.totals.subtotal.toFixed(2)}      `,
    `   Tax                     $${check.totals.taxTotal.toFixed(2)}      `,
    `   Service                 $${check.totals.serviceChargeTotal.toFixed(
      2
    )}      `,
    `   Total                   $${check.totals.totalDue.toFixed(2)}      `,
    check.header.status === 'closed'
      ? '  ----------- Check Closed -----------  '
      : '  ----------- Check Open -----------  ',
    `           ${new Date().toLocaleString()}            `,
  ];

  save(db);
  res.json(check);
});

// tender (ROOM_CHARGE) with env-driven trx code and optional auto-post to OPERA
app.post(
  '/checks/:checkId/tenders',
  validateSimphonyHeaders,
  async (req, res) => {
    const {checkId} = req.params;

    const defaultTxCode =
      process.env.SIMPHONY_TRANSACTION_CODE || 'ROOM_SERVICE';
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

    if (check.header.status === 'closed') {
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
        // TODO: VERIFY WITH CUSTOMER - Hotel ID mapping may need to be stored in tenant record
        // Currently using locRef as hotelId, but this may not be the correct mapping
        // Customer may need to provide hotelId separately or store it in tenant configuration
        const hotelId = req.headers['simphony-locref'];

        // 1) OPERA guest lookup using new API
        const qs = new URLSearchParams({
          room: String(roomNumber),
          lastName: String(lastName),
        }).toString();
        const guestResp = await fetch(
          `http://opera-state:5000/rsv/v1/hotels/${hotelId}/reservations?${qs}`
        );
        if (!guestResp.ok)
          return res.status(409).json({
            error: 'guest not found or not in-house (OPERA lookup failed)',
          });
        const guest = await guestResp.json();
        reservationId = guest.reservationId;

        // 2) Post folio charge with chosen transaction code using new API
        const postResp = await fetch(
          `http://opera-state:5000/csh/v1/hotels/${hotelId}/reservations/${encodeURIComponent(
            reservationId
          )}/charges`,
          {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              amount: check.totals.totalDue,
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
      check.header.status = 'closed';
      check.header.preparationStatus = 'Packaged';
      save(db);

      res.status(202).json({
        checkId,
        status: 'CLOSED',
        postedToOpera: autoPost,
        postingId,
        reservationId,
        transactionCode: trxCodeToUse,
        total: check.totals.totalDue,
      });
    } catch (e) {
      res
        .status(500)
        .json({error: 'tender processing error', details: String(e)});
    }
  }
);

// get check
app.get('/checks/:checkId', validateSimphonyHeaders, (req, res) => {
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

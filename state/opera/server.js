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
const DB = '/app/data/opera.json';
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

// Guest/reservation lookup
app.get('/rsv/v1/hotels/:hotelId/reservations', (req, res) => {
  const {roomId, surname} = req.query;
  const {hotelId} = req.params;

  if (!roomId || !surname) {
    return res
      .status(400)
      .json({error: 'roomId and surname query parameters required'});
  }

  const db = load();
  const key = `${roomId || ''}:${(surname || '').toLowerCase()}`;
  const guest = db.guests?.[key];

  if (!guest) {
    return res.status(404).json({error: 'Guest not found or not in-house'});
  }

  // Return in the new API format
  res.json({
    reservationId: guest.reservationId,
    folioWindow: guest.folioWindow || 1,
    guestName: guest.guestName,
    roomNumber: guest.roomNumber,
    inHouse: guest.inHouse,
    hotelId: hotelId,
  });
});

// Folio charge posting
app.post(
  '/csh/v1/hotels/:hotelId/reservations/:reservationId/charges',
  (req, res) => {
    const {reservationId, hotelId} = req.params;
    const {amount, transactionCode = 'ROOM_SERVICE'} = req.body || {};

    const db = load();
    db.folios ||= {};
    const folio = (db.folios[reservationId] ||= {
      reservationId,
      window: 1,
      lines: [],
    });

    const postingId = 'POST-' + Math.random().toString(36).slice(2, 8);
    const line = {
      postingId,
      trxCode: transactionCode,
      amount: Number(amount) || 0,
      hotelId: hotelId,
    };

    folio.lines.push(line);
    save(db);

    res.status(201).json({reservationId, postingId, line, hotelId});
  }
);

// Folio retrieval with query parameters
app.get(
  '/csh/v1/hotels/:hotelId/reservations/:reservationId/folios',
  (req, res) => {
    const {reservationId, hotelId} = req.params;
    const {
      folioWindowNo = '1',
      reservationBalanceOnly = 'false',
      fetchInstructions,
    } = req.query;

    const db = load();
    const folio = db.folios?.[reservationId];

    if (!folio) {
      return res.json({
        reservationId,
        hotelId,
        folioWindowNo: parseInt(folioWindowNo),
        lines: [],
        totalBalance: 0,
      });
    }

    // Calculate total balance if requested
    let totalBalance = 0;
    if (fetchInstructions && fetchInstructions.includes('Totalbalance')) {
      totalBalance = folio.lines.reduce((sum, line) => sum + line.amount, 0);
    }

    // Filter instructions if needed
    let responseData = {
      reservationId,
      hotelId,
      folioWindowNo: parseInt(folioWindowNo),
      lines: folio.lines,
      totalBalance,
    };

    // Add specific data based on fetchInstructions
    if (fetchInstructions) {
      if (fetchInstructions.includes('Payment')) {
        responseData.payments = folio.lines.filter((line) =>
          line.trxCode.startsWith('PAY')
        );
      }
      if (fetchInstructions.includes('Postings')) {
        responseData.postings = folio.lines.filter(
          (line) => !line.trxCode.startsWith('PAY')
        );
      }
      if (fetchInstructions.includes('Transactioncodes')) {
        responseData.transactionCodes = [
          ...new Set(folio.lines.map((line) => line.trxCode)),
        ];
      }
    }

    res.json(responseData);
  }
);

// helper to seed a guest record
app.post('/__seed/guest', (req, res) => {
  const {
    room,
    lastName,
    reservationId = 'RES-555',
    guestName = 'Guest',
    inHouse = true,
  } = req.body || {};
  if (!room || !lastName)
    return res.status(400).json({error: 'room and lastName required'});

  const db = load();
  db.guests ||= {};
  db.guests[`${room}|${lastName.toLowerCase()}`] = {
    reservationId,
    folioWindow: 1,
    guestName,
    roomNumber: room,
    inHouse,
  };
  save(db);
  res.json({ok: true});
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

app.listen(5000, () => console.log('opera-state listening on 5000'));

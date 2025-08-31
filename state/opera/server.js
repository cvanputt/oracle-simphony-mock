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

// guest lookup
app.get('/opera/v1/guests', (req, res) => {
  const {room, lastName} = req.query;
  const db = load();
  const key = `${room || ''}|${(lastName || '').toLowerCase()}`;
  const guest = db.guests?.[key];
  if (!guest)
    return res.status(404).json({error: 'Guest not found or not in-house'});
  res.json(guest);
});

// post folio charge
app.post('/opera/v1/folios/:reservationId/charges', (req, res) => {
  const {reservationId} = req.params;
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
  };

  folio.lines.push(line);
  save(db);

  res.status(201).json({reservationId, postingId, line});
});

// get folio
app.get('/opera/v1/folios/:reservationId', (req, res) => {
  const {reservationId} = req.params;
  const db = load();
  const folio = db.folios?.[reservationId];
  if (!folio) return res.json({reservationId, window: 1, lines: []});
  res.json(folio);
});

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

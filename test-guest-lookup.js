#!/usr/bin/env node

const http = require('http');
const https = require('https');

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            json: () => Promise.resolve(jsonData),
            text: () => Promise.resolve(data),
          });
        } catch (error) {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            json: () => Promise.reject(error),
            text: () => Promise.resolve(data),
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function testGuestLookup() {
  console.log('🧪 Testing Oracle Simphony Mock Guest Lookup...\n');

  try {
    // Step 1: Seed a test guest in OPERA
    console.log('1️⃣ Seeding test guest in OPERA...');
    const seedResponse = await makeRequest(
      'http://localhost:5102/__seed/guest',
      {
        method: 'POST',
        body: JSON.stringify({
          room: '203',
          lastName: 'Nguyen',
          reservationId: 'RES-555',
          guestName: 'Taylor Nguyen',
          inHouse: true,
        }),
      }
    );

    if (!seedResponse.ok) {
      throw new Error(
        `Failed to seed guest: ${seedResponse.status} ${seedResponse.statusText}`
      );
    }
    console.log('✅ Guest seeded successfully\n');

    // Step 2: Create a check in Simphony
    console.log('2️⃣ Creating a check in Simphony...');
    const checkResponse = await makeRequest('http://localhost:5101/checks', {
      method: 'POST',
      headers: {
        'Simphony-OrgShortName': 'TEST_ORG',
        'Simphony-LocRef': 'TEST_LOC',
        'Simphony-RvcRef': '1',
      },
      body: JSON.stringify({
        header: {
          orgShortName: 'TEST_ORG',
          locRef: 'TEST_LOC',
          rvcRef: 1,
          idempotencyId: 'test-idemp-123',
          checkEmployeeRef: 1,
          orderTypeRef: 1,
          tableName: 'Table 1',
          guestCount: 1,
          status: 'open',
        },
        menuItems: [
          {
            menuItemId: 1001,
            quantity: 2,
            unitPrice: 15.0,
            total: 30.0,
          },
        ],
      }),
    });

    if (!checkResponse.ok) {
      throw new Error(
        `Failed to create check: ${checkResponse.status} ${checkResponse.statusText}`
      );
    }

    const check = await checkResponse.json();
    console.log(`✅ Check created: ${check.header.checkRef}\n`);

    // Step 3: Add items to the check
    console.log('3️⃣ Adding items to the check...');
    const addItemsResponse = await makeRequest(
      `http://localhost:5101/checks/${check.header.checkRef}/items`,
      {
        method: 'POST',
        headers: {
          'Simphony-OrgShortName': 'TEST_ORG',
          'Simphony-LocRef': 'TEST_LOC',
          'Simphony-RvcRef': '1',
        },
        body: JSON.stringify({
          items: [
            {sku: 'RS-BURGER', qty: 1},
            {sku: 'RS-FRIES', qty: 1},
          ],
        }),
      }
    );

    if (!addItemsResponse.ok) {
      throw new Error(
        `Failed to add items: ${addItemsResponse.status} ${addItemsResponse.statusText}`
      );
    }

    const updatedCheck = await addItemsResponse.json();
    console.log(`✅ Items added. Total: $${updatedCheck.totals.totalDue}\n`);

    // Step 4: Test guest lookup and tender with ROOM_CHARGE
    console.log('4️⃣ Testing guest lookup and tender with ROOM_CHARGE...');
    const tenderResponse = await makeRequest(
      `http://localhost:5101/checks/${check.header.checkRef}/tenders`,
      {
        method: 'POST',
        headers: {
          'Simphony-OrgShortName': 'TEST_ORG',
          'Simphony-LocRef': 'TEST_LOC',
          'Simphony-RvcRef': '1',
        },
        body: JSON.stringify({
          type: 'ROOM_CHARGE',
          roomNumber: '203',
          lastName: 'Nguyen',
          transactionCode: 'ROOM_SERVICE',
        }),
      }
    );

    if (!tenderResponse.ok) {
      const errorText = await tenderResponse.text();
      throw new Error(
        `Failed to tender check: ${tenderResponse.status} ${tenderResponse.statusText} - ${errorText}`
      );
    }

    const tenderResult = await tenderResponse.json();
    console.log('✅ Tender successful!');
    console.log(`   - Posted to OPERA: ${tenderResult.postedToOpera}`);
    console.log(`   - Reservation ID: ${tenderResult.reservationId}`);
    console.log(`   - Posting ID: ${tenderResult.postingId}`);
    console.log(`   - Transaction Code: ${tenderResult.transactionCode}`);
    console.log(`   - Total: $${tenderResult.total}\n`);

    // Step 5: Verify the charge was posted to OPERA
    console.log('5️⃣ Verifying charge was posted to OPERA...');
    const folioResponse = await makeRequest(
      `http://localhost:5102/opera/v1/folios/${tenderResult.reservationId}`
    );

    if (!folioResponse.ok) {
      throw new Error(
        `Failed to get folio: ${folioResponse.status} ${folioResponse.statusText}`
      );
    }

    const folio = await folioResponse.json();
    console.log('✅ Folio retrieved successfully');
    console.log(`   - Reservation ID: ${folio.reservationId}`);
    console.log(`   - Number of charges: ${folio.lines.length}`);

    if (folio.lines.length > 0) {
      const lastCharge = folio.lines[folio.lines.length - 1];
      console.log(
        `   - Last charge: $${lastCharge.amount} (${lastCharge.trxCode})`
      );
    }

    console.log(
      '\n🎉 All tests passed! Guest lookup and OPERA integration is working correctly.'
    );
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testGuestLookup();

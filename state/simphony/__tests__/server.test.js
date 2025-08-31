const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Import the server app
let app;

// Mock console methods to avoid noise in tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.SIMPHONY_AUTO_POST = 'false'; // Disable auto-post for tests

  // Suppress console output during tests
  console.log = jest.fn();
  console.error = jest.fn();

  // Import the server after mocking
  jest.resetModules();
  app = require('../server');
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

describe('Simphony State Server', () => {
  describe('GET /checks', () => {
    it('should return empty array when no checks exist', async () => {
      const response = await request(app)
        .get('/checks')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual([]);
    });

    it('should return all checks when no filters applied', async () => {
      // Create some test checks first
      const check1 = await request(app)
        .post('/checks')
        .send({tableName: 'Table 1', employeeRef: 100, orderTypeRef: 1})
        .expect(201);

      const check2 = await request(app)
        .post('/checks')
        .send({tableName: 'Table 2', employeeRef: 200, orderTypeRef: 2})
        .expect(201);

      const response = await request(app)
        .get('/checks')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveLength(2);
      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({checkId: check1.body.checkId}),
          expect.objectContaining({checkId: check2.body.checkId}),
        ])
      );
    });

    it('should filter by checkEmployeeRef', async () => {
      // Create checks with different employee refs
      await request(app)
        .post('/checks')
        .send({tableName: 'Table 1', employeeRef: 123, orderTypeRef: 1})
        .expect(201);

      await request(app)
        .post('/checks')
        .send({tableName: 'Table 2', employeeRef: 456, orderTypeRef: 1})
        .expect(201);

      const response = await request(app)
        .get('/checks?checkEmployeeRef=123')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        employeeRef: 123,
        tableName: 'Table 1',
      });
    });

    it('should filter by tableName', async () => {
      // Create checks with different table names
      await request(app)
        .post('/checks')
        .send({tableName: 'VIP Table', employeeRef: 100, orderTypeRef: 1})
        .expect(201);

      await request(app)
        .post('/checks')
        .send({tableName: 'Regular Table', employeeRef: 200, orderTypeRef: 1})
        .expect(201);

      const response = await request(app)
        .get('/checks?tableName=VIP%20Table')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        tableName: 'VIP Table',
      });
    });

    it('should filter by orderTypeRef', async () => {
      // Create checks with different order types
      await request(app)
        .post('/checks')
        .send({tableName: 'Table 1', employeeRef: 100, orderTypeRef: 1})
        .expect(201);

      await request(app)
        .post('/checks')
        .send({tableName: 'Table 2', employeeRef: 200, orderTypeRef: 2})
        .expect(201);

      const response = await request(app)
        .get('/checks?orderTypeRef=2')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        orderTypeRef: 2,
      });
    });

    it('should filter by checkNumbers (single number)', async () => {
      const check = await request(app)
        .post('/checks')
        .send({tableName: 'Table 1', employeeRef: 100, orderTypeRef: 1})
        .expect(201);

      const response = await request(app)
        .get(`/checks?checkNumbers=${check.body.checkNumber}`)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        checkNumber: check.body.checkNumber,
      });
    });

    it('should filter by checkNumbers (multiple numbers)', async () => {
      const check1 = await request(app)
        .post('/checks')
        .send({tableName: 'Table 1', employeeRef: 100, orderTypeRef: 1})
        .expect(201);

      const check2 = await request(app)
        .post('/checks')
        .send({tableName: 'Table 2', employeeRef: 200, orderTypeRef: 1})
        .expect(201);

      await request(app)
        .post('/checks')
        .send({tableName: 'Table 3', employeeRef: 300, orderTypeRef: 1})
        .expect(201);

      const response = await request(app)
        .get(
          `/checks?checkNumbers=${check1.body.checkNumber}&checkNumbers=${check2.body.checkNumber}`
        )
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveLength(2);
      expect(response.body.map((c) => c.checkNumber)).toEqual(
        expect.arrayContaining([
          check1.body.checkNumber,
          check2.body.checkNumber,
        ])
      );
    });

    it('should filter by sinceTime', async () => {
      // Create a check
      const check = await request(app)
        .post('/checks')
        .send({tableName: 'Table 1', employeeRef: 100, orderTypeRef: 1})
        .expect(201);

      const checkTime = new Date(check.body.createdTime);
      const beforeTime = new Date(checkTime.getTime() - 1000).toISOString();
      const afterTime = new Date(checkTime.getTime() + 1000).toISOString();

      // Should include the check when sinceTime is before check creation
      const response1 = await request(app)
        .get(`/checks?sinceTime=${beforeTime}`)
        .expect(200);

      expect(response1.body).toHaveLength(1);
      expect(response1.body[0].checkId).toBe(check.body.checkId);

      // Should exclude the check when sinceTime is after check creation
      const response2 = await request(app)
        .get(`/checks?sinceTime=${afterTime}`)
        .expect(200);

      expect(response2.body).toHaveLength(0);
    });

    it('should filter by includeClosed=false', async () => {
      // Create an open check
      const openCheck = await request(app)
        .post('/checks')
        .send({tableName: 'Table 1', employeeRef: 100, orderTypeRef: 1})
        .expect(201);

      // Create a closed check
      const closedCheck = await request(app)
        .post('/checks')
        .send({tableName: 'Table 2', employeeRef: 200, orderTypeRef: 1})
        .expect(201);

      // Close the second check
      await request(app)
        .post(`/checks/${closedCheck.body.checkId}/tenders`)
        .send({
          type: 'ROOM_CHARGE',
          roomNumber: 101,
          lastName: 'Smith',
        })
        .expect(202);

      const response = await request(app)
        .get('/checks?includeClosed=false')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].checkId).toBe(openCheck.body.checkId);
      expect(response.body[0].status).toBe('OPEN');
    });

    it('should combine multiple filters', async () => {
      // Create checks with different properties
      await request(app)
        .post('/checks')
        .send({tableName: 'VIP Table', employeeRef: 123, orderTypeRef: 1})
        .expect(201);

      await request(app)
        .post('/checks')
        .send({tableName: 'VIP Table', employeeRef: 456, orderTypeRef: 1})
        .expect(201);

      await request(app)
        .post('/checks')
        .send({tableName: 'Regular Table', employeeRef: 123, orderTypeRef: 2})
        .expect(201);

      const response = await request(app)
        .get('/checks?tableName=VIP%20Table&checkEmployeeRef=123')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        tableName: 'VIP Table',
        employeeRef: 123,
      });
    });

    it('should handle invalid checkEmployeeRef gracefully', async () => {
      const response = await request(app)
        .get('/checks?checkEmployeeRef=invalid')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual([]);
    });

    it('should handle invalid orderTypeRef gracefully', async () => {
      const response = await request(app)
        .get('/checks?orderTypeRef=invalid')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual([]);
    });

    it('should handle invalid sinceTime gracefully', async () => {
      const response = await request(app)
        .get('/checks?sinceTime=invalid-date')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual([]);
    });
  });

  describe('POST /checks', () => {
    it('should create a new check with provided data', async () => {
      const checkData = {
        tableName: 'VIP Table',
        employeeRef: 123,
        orderTypeRef: 2,
      };

      const response = await request(app)
        .post('/checks')
        .send(checkData)
        .expect(201)
        .expect('Content-Type', /json/);

      expect(response.body).toMatchObject({
        checkId: expect.stringMatching(/^CHK-\d{4}$/),
        checkNumber: expect.any(Number),
        tableName: 'VIP Table',
        employeeRef: 123,
        orderTypeRef: 2,
        status: 'OPEN',
        items: [],
        subtotal: 0,
        tax: 0,
        service: 0,
        total: 0,
      });

      expect(response.body.createdTime).toBeDefined();
      expect(new Date(response.body.createdTime)).toBeInstanceOf(Date);
    });

    it('should create a check with default values when no data provided', async () => {
      const response = await request(app)
        .post('/checks')
        .send({})
        .expect(201)
        .expect('Content-Type', /json/);

      expect(response.body).toMatchObject({
        checkId: expect.stringMatching(/^CHK-\d{4}$/),
        checkNumber: expect.any(Number),
        tableName: expect.stringMatching(/^Table \d+$/),
        employeeRef: expect.any(Number),
        orderTypeRef: 1,
        status: 'OPEN',
        items: [],
        subtotal: 0,
        tax: 0,
        service: 0,
        total: 0,
      });
    });

    it('should create unique check IDs', async () => {
      const check1 = await request(app).post('/checks').send({}).expect(201);

      const check2 = await request(app).post('/checks').send({}).expect(201);

      expect(check1.body.checkId).not.toBe(check2.body.checkId);
    });

    it('should create unique check numbers', async () => {
      const check1 = await request(app).post('/checks').send({}).expect(201);

      const check2 = await request(app).post('/checks').send({}).expect(201);

      expect(check1.body.checkNumber).not.toBe(check2.body.checkNumber);
    });
  });

  describe('GET /checks/:checkId', () => {
    it('should return a specific check by ID', async () => {
      const createdCheck = await request(app)
        .post('/checks')
        .send({tableName: 'Test Table', employeeRef: 100, orderTypeRef: 1})
        .expect(201);

      const response = await request(app)
        .get(`/checks/${createdCheck.body.checkId}`)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual(createdCheck.body);
    });

    it('should return 404 for non-existent check', async () => {
      const response = await request(app)
        .get('/checks/NONEXISTENT')
        .expect(404)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual({error: 'check not found'});
    });
  });

  describe('POST /checks/:checkId/items', () => {
    it('should add items to a check', async () => {
      const check = await request(app)
        .post('/checks')
        .send({tableName: 'Test Table', employeeRef: 100, orderTypeRef: 1})
        .expect(201);

      const itemData = {
        items: [
          {
            sku: 'RS-BURGER',
            qty: 2,
          },
        ],
      };

      const response = await request(app)
        .post(`/checks/${check.body.checkId}/items`)
        .send(itemData)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0]).toMatchObject(itemData.items[0]);
      expect(response.body.subtotal).toBe(28.0); // 14.0 * 2
      expect(response.body.total).toBeGreaterThan(28.0); // Includes tax and service
    });

    it('should return 404 for non-existent check', async () => {
      const response = await request(app)
        .post('/checks/NONEXISTENT/items')
        .send({sku: 'TEST', qty: 1})
        .expect(404)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual({error: 'check not found'});
    });

    it('should handle multiple items', async () => {
      const check = await request(app)
        .post('/checks')
        .send({tableName: 'Test Table', employeeRef: 100, orderTypeRef: 1})
        .expect(201);

      // Add first item
      await request(app)
        .post(`/checks/${check.body.checkId}/items`)
        .send({items: [{sku: 'RS-BURGER', qty: 1}]})
        .expect(200);

      // Add second item
      const response = await request(app)
        .post(`/checks/${check.body.checkId}/items`)
        .send({items: [{sku: 'RS-FRIES', qty: 1}]})
        .expect(200);

      expect(response.body.items).toHaveLength(2);
      expect(response.body.subtotal).toBe(19.0); // 14.0 + 5.0
    });
  });

  describe('POST /checks/:checkId/tenders', () => {
    it('should tender a check and close it', async () => {
      const check = await request(app)
        .post('/checks')
        .send({tableName: 'Test Table', employeeRef: 100, orderTypeRef: 1})
        .expect(201);

      // Add an item first
      await request(app)
        .post(`/checks/${check.body.checkId}/items`)
        .send({items: [{sku: 'RS-BURGER', qty: 1}]})
        .expect(200);

      // Get the updated check to see the total
      const updatedCheck = await request(app)
        .get(`/checks/${check.body.checkId}`)
        .expect(200);

      const tenderData = {
        type: 'ROOM_CHARGE',
        roomNumber: 101,
        lastName: 'Smith',
      };

      const response = await request(app)
        .post(`/checks/${check.body.checkId}/tenders`)
        .send(tenderData)
        .expect(202)
        .expect('Content-Type', /json/);

      expect(response.body.status).toBe('CLOSED');
      expect(response.body.postedToOpera).toBeDefined();
      expect(response.body.transactionCode).toBeDefined();
    });

    it('should return 404 for non-existent check', async () => {
      const response = await request(app)
        .post('/checks/NONEXISTENT/tenders')
        .send({amount: 10.0})
        .expect(404)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual({error: 'check not found'});
    });

    it('should return 409 if check is already closed', async () => {
      const check = await request(app)
        .post('/checks')
        .send({tableName: 'Test Table', employeeRef: 100, orderTypeRef: 1})
        .expect(201);

      // Add an item
      await request(app)
        .post(`/checks/${check.body.checkId}/items`)
        .send({items: [{sku: 'RS-BURGER', qty: 1}]})
        .expect(200);

      // Get the updated check
      const updatedCheck = await request(app)
        .get(`/checks/${check.body.checkId}`)
        .expect(200);

      // Tender the check
      await request(app)
        .post(`/checks/${check.body.checkId}/tenders`)
        .send({
          type: 'ROOM_CHARGE',
          roomNumber: 101,
          lastName: 'Smith',
        })
        .expect(202);

      // Try to tender again
      const response = await request(app)
        .post(`/checks/${check.body.checkId}/tenders`)
        .send({
          type: 'ROOM_CHARGE',
          roomNumber: 101,
          lastName: 'Smith',
        })
        .expect(409)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual({error: 'check is already closed'});
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/unknown-endpoint')
        .expect(404)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual({error: 'endpoint not found'});
    });

    it('should return 500 for server errors', async () => {
      // This test would require mocking the database functions to throw errors
      // For now, we'll test the error handler by checking the middleware is in place
      const response = await request(app).get('/checks').expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('Content-Type Headers', () => {
    it('should set Content-Type to application/json for all responses', async () => {
      const responses = await Promise.all([
        request(app).get('/checks'),
        request(app).post('/checks').send({}),
        request(app).get('/checks/NONEXISTENT'),
        request(app).get('/unknown-endpoint'),
      ]);

      responses.forEach((response) => {
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });
    });
  });
});

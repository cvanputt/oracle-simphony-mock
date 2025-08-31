// Test setup file
const fs = require('fs');
const path = require('path');

// Create a test database file path
const testDbPath = path.join(__dirname, 'test-db.json');

// Clean up test database before each test
beforeEach(() => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

// Clean up test database after each test
afterEach(() => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

// Set environment variable to use test database
process.env.TEST_DB_PATH = testDbPath;

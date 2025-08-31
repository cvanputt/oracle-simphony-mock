# Simphony State Server Tests

This directory contains comprehensive unit tests for the Simphony State Server using Jest and Supertest.

## Test Structure

The test suite covers all major endpoints and functionality:

### GET /checks

- ✅ Returns empty array when no checks exist
- ✅ Returns all checks when no filters applied
- ✅ Filters by `checkEmployeeRef` (integer)
- ✅ Filters by `tableName` (string)
- ✅ Filters by `orderTypeRef` (integer)
- ✅ Filters by `checkNumbers` (single and multiple integers)
- ✅ Filters by `sinceTime` (ISO date string)
- ✅ Filters by `includeClosed=false` (boolean)
- ✅ Combines multiple filters
- ✅ Handles invalid parameters gracefully

### POST /checks

- ✅ Creates new check with provided data
- ✅ Creates check with default values when no data provided
- ✅ Generates unique check IDs
- ✅ Generates unique check numbers

### GET /checks/:checkId

- ✅ Returns specific check by ID
- ✅ Returns 404 for non-existent check

### POST /checks/:checkId/items

- ✅ Adds items to a check
- ✅ Returns 404 for non-existent check
- ✅ Handles multiple items

### POST /checks/:checkId/tenders

- ✅ Tenders a check and closes it (room charge)
- ✅ Returns 404 for non-existent check
- ✅ Returns 409 if check is already closed

### Error Handling

- ✅ Returns 404 for unknown endpoints
- ✅ Returns 500 for server errors
- ✅ Sets Content-Type to application/json for all responses

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Coverage

Current coverage: **86.4%** (28/28 tests passing)

- **Statements**: 86.4%
- **Branches**: 78.26%
- **Functions**: 90.47%
- **Lines**: 86.44%

## Test Environment

- **Test Database**: Uses isolated test database file (`test-db.json`)
- **Environment**: Sets `NODE_ENV=test` and `SIMPHONY_AUTO_POST=false`
- **Mocking**: Disables console output and external service calls
- **Cleanup**: Automatically cleans up test database between tests

## Test Data

Tests use realistic data that matches the actual API:

- **Menu Items**: Uses actual SKUs like `RS-BURGER`, `RS-FRIES`, etc.
- **Pricing**: Matches the actual price catalog in the server
- **Check IDs**: Generated in the same format as production (`CHK-XXXX`)
- **Room Charges**: Tests the room charge tender flow with proper parameters

## Adding New Tests

When adding new tests:

1. Follow the existing test structure and naming conventions
2. Use descriptive test names that explain the expected behavior
3. Test both success and error cases
4. Ensure proper cleanup between tests
5. Update this README with new test descriptions

## Troubleshooting

If tests fail:

1. Check that the test database is being cleaned up properly
2. Verify that environment variables are set correctly
3. Ensure the server is not trying to start listening during tests
4. Check that all required dependencies are installed

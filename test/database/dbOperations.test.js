const { bulkStatusSetup, cleanUpTest } = require('../populateTestData');
const {
  initializeBulkFileCount,
  decrementBulkFileCount,
  findResourceById
} = require('../../src/database/dbOperations');

describe('check bulk file count logic', () => {
  beforeAll(bulkStatusSetup);

  test('initialize bulk file count for a given client id', async () => {
    const CLIENT_ID = 'PENDING_REQUEST';
    // arbitrary file and resource counts used for initialization
    const FILE_COUNT = 10;
    const RESOURCE_COUNT = 100;
    await initializeBulkFileCount(CLIENT_ID, FILE_COUNT, RESOURCE_COUNT).then(async () => {
      const result = await findResourceById(CLIENT_ID, 'bulkImportStatuses');
      expect(result.exportedFileCount).toEqual(FILE_COUNT);
      expect(result.totalFileCount).toEqual(FILE_COUNT);
      expect(result.exportedResourceCount).toEqual(RESOURCE_COUNT);
      expect(result.totalResourceCount).toEqual(RESOURCE_COUNT);
    });
  });

  test('decrement bulk file count (but not resource count) for a given client id', async () => {
    const CLIENT_ID = 'PENDING_REQUEST_WITH_FILE_COUNT';
    // exported file count was initialized to 10 in testBulkStatus.json
    const EXPECTED_EXPORTED_FILE_COUNT = 9;
    // resource counts are unavailable
    const EXPECTED_EXPORTED_RESOURCE_COUNT = -1;
    await decrementBulkFileCount(CLIENT_ID, -1).then(async () => {
      const result = await findResourceById(CLIENT_ID, 'bulkImportStatuses');
      expect(result.exportedFileCount).toEqual(EXPECTED_EXPORTED_FILE_COUNT);
      expect(result.exportedResourceCount).toEqual(EXPECTED_EXPORTED_RESOURCE_COUNT);
    });
  });

  test('decrement bulk file count and resource count for a given client id', async () => {
    const CLIENT_ID = 'PENDING_REQUEST_WITH_RESOURCE_COUNT';
    // decrement 10 resources from the amount of exported resources
    const NUM_DECREMENTED_RESOURCES = 10;
    // exported file count was initialized to 10 in testBulkStatus.json
    const EXPECTED_EXPORTED_FILE_COUNT = 9;
    // exported resource count was initialized to 200 in testBulkStatus.json
    const EXPECTED_EXPORTED_RESOURCE_COUNT = 190;
    await decrementBulkFileCount(CLIENT_ID, NUM_DECREMENTED_RESOURCES).then(async () => {
      const result = await findResourceById(CLIENT_ID, 'bulkImportStatuses');
      expect(result.exportedFileCount).toEqual(EXPECTED_EXPORTED_FILE_COUNT);
      expect(result.exportedResourceCount).toEqual(EXPECTED_EXPORTED_RESOURCE_COUNT);
    });
  });

  afterAll(cleanUpTest);
});

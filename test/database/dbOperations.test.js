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
    await decrementBulkFileCount(CLIENT_ID, -1).then(async () => {
      const result = await findResourceById(CLIENT_ID, 'bulkImportStatuses');
      expect(result.exportedFileCount).toEqual(9);
      expect(result.totalFileCount).toEqual(100);
      expect(result.exportedResourceCount).toEqual(-1);
      expect(result.totalResourceCount).toEqual(-1);
    });
  });

  test('decrement bulk file count and resource count for a given client id', async () => {
    const CLIENT_ID = 'PENDING_REQUEST_WITH_RESOURCE_COUNT';
    const NUM_DECREMENTED_RESOURCES = 10;
    await decrementBulkFileCount(CLIENT_ID, NUM_DECREMENTED_RESOURCES).then(async () => {
      const result = await findResourceById(CLIENT_ID, 'bulkImportStatuses');
      expect(result.exportedFileCount).toEqual(9);
      expect(result.totalFileCount).toEqual(100);
      expect(result.exportedResourceCount).toEqual(190);
      expect(result.totalResourceCount).toEqual(500);
    });
  });

  afterAll(cleanUpTest);
});

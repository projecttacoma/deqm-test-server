const { bulkStatusSetup, cleanUpTest, createTestResource } = require('../populateTestData');
const { client } = require('../../src/database/connection');
const {
  initializeBulkFileCount,
  decrementBulkFileCount,
  failBulkImportRequest,
  findResourceById,
  pushBulkFailedOutcomes,
  getCountOfCollection
} = require('../../src/database/dbOperations');

describe('check bulk file count logic', () => {
  beforeAll(bulkStatusSetup);

  test('initialize bulk file count for a given client id', async () => {
    const CLIENT_ID = 'PENDING_REQUEST';
    // arbitrary file and resource counts used for initialization
    const FILE_COUNT = 10;
    const RESOURCE_COUNT = 100;
    await initializeBulkFileCount(CLIENT_ID, FILE_COUNT, RESOURCE_COUNT);
    const result = await findResourceById(CLIENT_ID, 'bulkImportStatuses');
    expect(result.exportedFileCount).toEqual(FILE_COUNT);
    expect(result.totalFileCount).toEqual(FILE_COUNT);
    expect(result.exportedResourceCount).toEqual(RESOURCE_COUNT);
    expect(result.totalResourceCount).toEqual(RESOURCE_COUNT);
  });

  test('decrement bulk file count (but not resource count) for a given client id', async () => {
    const CLIENT_ID = 'PENDING_REQUEST_WITH_FILE_COUNT';
    // exported file count was initialized to 10 in testBulkStatus.json
    const EXPECTED_EXPORTED_FILE_COUNT = 9;
    // resource counts are unavailable
    const EXPECTED_EXPORTED_RESOURCE_COUNT = -1;
    await decrementBulkFileCount(CLIENT_ID, -1);
    const result = await findResourceById(CLIENT_ID, 'bulkImportStatuses');
    expect(result.exportedFileCount).toEqual(EXPECTED_EXPORTED_FILE_COUNT);
    expect(result.exportedResourceCount).toEqual(EXPECTED_EXPORTED_RESOURCE_COUNT);
  });

  test('decrement bulk file count and resource count for a given client id', async () => {
    const CLIENT_ID = 'PENDING_REQUEST_WITH_RESOURCE_COUNT';
    // decrement 10 resources from the amount of exported resources
    const NUM_DECREMENTED_RESOURCES = 10;
    // exported file count was initialized to 10 in testBulkStatus.json
    const EXPECTED_EXPORTED_FILE_COUNT = 9;
    // exported resource count was initialized to 200 in testBulkStatus.json
    const EXPECTED_EXPORTED_RESOURCE_COUNT = 190;
    await decrementBulkFileCount(CLIENT_ID, NUM_DECREMENTED_RESOURCES);
    const result = await findResourceById(CLIENT_ID, 'bulkImportStatuses');
    expect(result.exportedFileCount).toEqual(EXPECTED_EXPORTED_FILE_COUNT);
    expect(result.exportedResourceCount).toEqual(EXPECTED_EXPORTED_RESOURCE_COUNT);
  });

  test('check bulk import request is completed once exported file count reaches zero', async () => {
    const CLIENT_ID = 'ALMOST_COMPLETE_PENDING_REQUEST';
    const NUM_DECREMENTED_RESOURCES = 10;
    // all resources and files will be exported
    await decrementBulkFileCount(CLIENT_ID, NUM_DECREMENTED_RESOURCES);
    const result = await findResourceById(CLIENT_ID, 'bulkImportStatuses');
    expect(result.status).toEqual('Completed');
    expect(result.exportedFileCount).toEqual(0);
    expect(result.exportedResourceCount).toEqual(0);
  });

  afterAll(cleanUpTest);
});

describe('check bulk import status logic', () => {
  beforeAll(bulkStatusSetup);
  test('updated bulk status to failed', async () => {
    const CLIENT_ID = 'PENDING_REQUEST';
    const TEST_ERROR = { message: 'An error occurred' };
    await failBulkImportRequest(CLIENT_ID, TEST_ERROR);
    const result = await findResourceById(CLIENT_ID, 'bulkImportStatuses');
    expect(result.status).toEqual('Failed');
    expect(result.error.code).toEqual(500);
    expect(result.error.message).toEqual(TEST_ERROR.message);
  });
  test('push to failed outcomes adds correctly to failed outcome array', async () => {
    const CLIENT_ID = 'PENDING_REQUEST';
    const exampleOutcomes = ['test1', 'test2'];
    await pushBulkFailedOutcomes(CLIENT_ID, exampleOutcomes);
    const result = await findResourceById(CLIENT_ID, 'bulkImportStatuses');
    expect(result.failedOutcomes).toEqual(['test1', 'test2']);
  });

  afterAll(cleanUpTest);
});

describe('check collection counts', () => {
  beforeAll(async () => {
    await client.connect();
    await createTestResource({ resourceType: 'Patient', id: 'patient1' }, 'Patient');
  });
  test('get count of specified resource', async () => {
    const result = await getCountOfCollection('Measure');
    expect(result).toEqual(0);
  });
  test('get count of specified resource', async () => {
    const result = await getCountOfCollection('Patient');
    expect(result).toEqual(1);
  });

  afterAll(cleanUpTest);
});

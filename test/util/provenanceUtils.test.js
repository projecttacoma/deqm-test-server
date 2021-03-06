const { resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const { buildDelegator, createAuditEventFromProvenance } = require('../../src/util/provenanceUtils');
const {
  DELEGATOR_WHO,
  EXPECTED_DELEGATOR,
  SINGLE_AGENT_PROVENANCE,
  SINGLE_AGENT_AUDIT,
  ON_BEHALF_OF_PROVENANCE,
  ON_BEHALF_OF_AUDIT,
  AMENDING_PROVENANCE,
  AMENDING_AUDIT
} = require('../fixtures/provenanceFixtures');
const { v4: uuidv4 } = require('uuid');
const queue = require('../../src/queue/importQueue');

jest.mock('uuid', () => {
  return {
    v4: jest.fn()
  };
});

const args = { base_version: '4_0_1' };

describe('provenanceUtils tests', () => {
  beforeEach(() => {
    uuidv4.mockImplementationOnce(() => 'TEST_ID');
  });
  test('buildDelegator returns proper agent object', () => {
    const delegator = buildDelegator(DELEGATOR_WHO);
    expect(delegator).toEqual(EXPECTED_DELEGATOR);
  });

  test('createAuditEventFromProvenance works with single agent acting by itself', () => {
    let expected = resolveSchema('4_0_1', 'auditevent');
    expected = new expected(SINGLE_AGENT_AUDIT);
    expect(createAuditEventFromProvenance(JSON.stringify(SINGLE_AGENT_PROVENANCE), args.base_version)).toEqual(
      expected.toJSON()
    );
  });
  test('createAuditEventFromProvenance works with single agent acting on behalf of another', () => {
    let expected = resolveSchema('4_0_1', 'auditevent');
    expected = new expected(ON_BEHALF_OF_AUDIT);
    expect(createAuditEventFromProvenance(JSON.stringify(ON_BEHALF_OF_PROVENANCE), args.base_version)).toEqual(
      expected.toJSON()
    );
  });
  test('createAuditEventFromProvenance works with single agent updating a resource', () => {
    let expected = resolveSchema('4_0_1', 'auditevent');
    expected = new expected(AMENDING_AUDIT);
    expect(createAuditEventFromProvenance(JSON.stringify(AMENDING_PROVENANCE), args.base_version)).toEqual(
      expected.toJSON()
    );
  });

  afterAll(async () => await queue.close());
});

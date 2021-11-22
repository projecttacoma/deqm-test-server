const { resolveSchema } = require('@projecttacoma/node-fhir-server-core/dist/server/utils/schema.utils');
const { buildDelegator, createAuditEventFromProvenance } = require('../src/util/provenanceUtils');
const {
  DELEGATOR_WHO,
  EXPECTED_DELEGATOR,
  SINGLE_AGENT_PROVENANCE,
  SINGLE_AGENT_AUDIT,
  ON_BEHALF_OF_PROVENANCE,
  ON_BEHALF_OF_AUDIT,
  AMENDING_PROVENANCE,
  AMEDNING_AUDIT
} = require('./fixtures/testProvenanceUtils');

const args = { base_version: '4_0_1' };

describe.only('provenanceUtils tests', () => {
  test('buildDelegator returns proper agent object', () => {
    const delegator = buildDelegator(DELEGATOR_WHO);
    expect(delegator).toEqual(EXPECTED_DELEGATOR);
  });

  test('createAuditEventFromProvenance works with single agent acting by itself', () => {
    let expected = resolveSchema('4_0_1', 'auditevent');
    expected = new expected(SINGLE_AGENT_AUDIT);
    expect(createAuditEventFromProvenance(SINGLE_AGENT_PROVENANCE, args)).toEqual(expected);
  });
  test.only('createAuditEventFromProvenance works with single agent acting on behalf of another', () => {
    let expected = resolveSchema('4_0_1', 'auditevent');
    expected = new expected(ON_BEHALF_OF_AUDIT);
    expect(createAuditEventFromProvenance(ON_BEHALF_OF_PROVENANCE, args)).toEqual(expected);
  });
  test('createAuditEventFromProvenance works with single agent updating a resource', () => {
    let expected = resolveSchema('4_0_1', 'auditevent');
    expected = new expected(AMEDNING_AUDIT);
    expect(createAuditEventFromProvenance(AMENDING_PROVENANCE, args)).toEqual(expected);
  });
});

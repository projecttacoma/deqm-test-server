const { resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const { v4: uuidv4 } = require('uuid');

/**
 * Creates a raw JSON AuditEvent resource from the X-Provenance headers of a submission request
 * @param {string} provenance the provenance headers in string form from the request
 * @param {Object} args the object containing the base_version parameter
 * @returns A JSON object representing an AuditEvent to be stored in the system
 */
const createAuditEventFromProvenance = (provenance, args) => {
  provenance = JSON.parse(provenance);
  const audit = {};
  audit.type = {
    system: 'http://dicom.nema.org/resources/ontology/DCM',
    code: '110100',
    display: 'Application Activity'
  };
  audit.period = provenance.occurredPeriod;
  audit.recorded = provenance.recorded;
  // 0 represents a successful request
  // TODO: Add functionality for catching an unsuccessful request
  audit.outcome = 0;
  audit.purposeOfEvent = [];
  if (provenance.reason) {
    audit.purposeOfEvent.push(...provenance.reason);
  }

  switch (provenance?.activity?.coding?.[0]?.code) {
    case 'UPDATE':
      audit.action = 'U';
      break;
    default:
      // Default to C for CREATE for now
      audit.action = 'C';
      break;
  }
  let source = {};
  audit.agent = [];
  if (provenance.agent) {
    provenance.agent.forEach(agent => {
      agent['requestor'] = true;

      if (agent.role.coding.filter(role => role.code === 'AGNT').length > 0) {
        agent['requestor'] = false;
        source = agent.who;
      }
      if (agent.role.coding.filter(role => role.code === 'ASSIGNED').length > 0) {
        source = agent.who;
      }

      if (agent.onBehalfOf) {
        audit.agent.push(buildDelegator(agent.onBehalfOf));
        // Change the onBehalfOf to undefined since we already store this info as
        // another agent in the AuditEvent
        agent.onBehalfOf = undefined;
      }
      audit.agent.push(agent);
    });
    audit.source = { observer: source };
  }
  audit['id'] = uuidv4();
  const AuditEvent = resolveSchema(args.base_version, 'auditevent');
  return new AuditEvent(audit).toJSON();
};

/**
 * In the event of an agent acting on behalf of another agent, this function
 * wraps the reference to the delegating agent properly for storage in an AuditEvent resource
 * @param {Object} reference a fhir reference object to the delegating agent
 * @returns a delegating agent to be added to an AuditEvent
 */
const buildDelegator = reference => {
  return {
    type: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
          code: 'DELEGATOR',
          display: 'delegator'
        }
      ]
    },
    role: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
          code: 'DELEGATOR',
          display: 'delegator'
        }
      ]
    },
    who: reference,
    requestor: true
  };
};

module.exports = { createAuditEventFromProvenance, buildDelegator };

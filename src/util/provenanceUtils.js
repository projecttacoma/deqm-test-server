const { resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const { v4: uuidv4 } = require('uuid');

const createAuditEventFromProvenance = (provenance, args) => {
  console.log(provenance);
  provenance = JSON.parse(provenance);
  const audit = {};
  audit.type = {
    system: 'http://dicom.nema.org/resources/ontology/DCM',
    code: '110100',
    display: 'Application Activity'
  };
  audit.period = provenance.occurredPeriod;
  audit.recorded = provenance.recorded;
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

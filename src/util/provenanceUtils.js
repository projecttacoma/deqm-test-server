const { resolveSchema, ServerError } = require('@projecttacoma/node-fhir-server-core');
const { v4: uuidv4 } = require('uuid');

/**
 * Creates a raw JSON AuditEvent resource from the X-Provenance headers of a submission request
 * @param {string} provenance the provenance headers in string form from the request
 * @param {Object} version base_version from parameter
 * @returns A JSON object representing an AuditEvent to be stored in the system
 */
const createAuditEventFromProvenance = (provenance, version) => {
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
  if (provenance.reason) {
    audit.purposeOfEvent = [];
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
  provenance.agent.forEach(agent => {
    agent['requestor'] = true;

    // TODO: should these be safe-accessed?
    if (agent.role.coding.some(role => role.code === 'AGNT')) {
      agent['requestor'] = false;
      source = agent.who;
    }
    if (agent.role.coding.some(role => role.code === 'ASSIGNED')) {
      source = agent.who;
    }

    if (agent.onBehalfOf) {
      audit.agent.push(buildDelegator(agent.onBehalfOf));
      // Delete onBehalfOf since we already store this info as
      // another agent in the AuditEvent
      delete agent.onBehalfOf;
    }
    // We're currently not supporting storage of type designations
    delete agent.type;

    audit.agent.push(agent);
  });
  audit.source = { observer: source };
  audit['id'] = uuidv4();
  audit.entity = [];
  const AuditEvent = resolveSchema(version, 'auditevent');
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
    role: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-RoleClass',
          code: 'PROV',
          display: 'healthcare provider'
        }
      ]
    },
    who: reference,
    requestor: true
  };
};

/**
 * Checks that provenance header is present, has Provenance resourceType,
 * and does not yet have a populated target. Throws appropriate
 * errors if needed,
 * @param {Object} requestHeaders the headers from the request body
 */
const checkProvenanceHeader = requestHeaders => {
  const provenanceRequest = JSON.parse(requestHeaders['x-provenance']);
  if (provenanceRequest.resourceType !== 'Provenance') {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Expected resourceType 'Provenance' for Provenance header. Received ${provenanceRequest.resourceType}.`
          }
        }
      ]
    });
  }

  if (provenanceRequest.target) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `The 'target' attribute should not be populated in the provenance header`
          }
        }
      ]
    });
  }

  if (!provenanceRequest.agent || provenanceRequest.agent.length === 0) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `The provenance header must specify at least 1 agent in the agent attribute`
          }
        }
      ]
    });
  }
};

/**
 * Populates 'target' attribute of provenance header with the desired reference
 * to the ID that the server uses for a resource that was created via POST/PUT
 *
 * will probably need to change for multiple references
 * @param {*} requestHeaders the headers from the request body
 * @param {*} res the response body
 * @param {*} target array of reference objects for provenance header
 */
const populateProvenanceTarget = (requestHeaders, res, target) => {
  const provenanceRequest = JSON.parse(requestHeaders['x-provenance']);
  provenanceRequest.target = target;
  res.setHeader('X-Provenance', JSON.stringify(provenanceRequest));
};

module.exports = { createAuditEventFromProvenance, buildDelegator, checkProvenanceHeader, populateProvenanceTarget };

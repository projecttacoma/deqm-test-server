import axios from 'axios';
import { CalculationOptions, Calculator, DRCalculationOutput } from 'fqm-execution';
import _ from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import { findResourceById, findResourceIdsWithQuery } from '../database/dbOperations';
import { BadRequestError, ResourceNotFoundError } from './errorUtils';

const { uploadResourcesFromBundle } = require('../services/bundle.service');

const PATIENT_ID_CONTEXT_TOKEN = '{{context.patientId}}';

function populatePatientIdContext(dataRequirements: DRCalculationOutput, patientId: string): DRCalculationOutput {
  dataRequirements.results.dataRequirement?.forEach(dataRequirement => {
    dataRequirement.extension?.forEach(extension => {
      if (extension.valueString) {
        extension.valueString = extension.valueString.replaceAll(PATIENT_ID_CONTEXT_TOKEN, patientId);
      }
    });
  });
  return dataRequirements;
}

/**
 * To be used in a future $collect-data workflow, this function takes a measure bundle ID
 * and a patient ID and returns the results of calculateDataRequirements with the patient
 * ID injected into the cqfm FHIR queries in the output
 */
export async function patientSpecificDataRequirements(
  measureBundle: fhir4.Bundle,
  patientId: string,
  options: CalculationOptions = {}
): Promise<DRCalculationOutput> {
  const dataRequirements = await Calculator.calculateDataRequirements(measureBundle, options);
  return populatePatientIdContext(dataRequirements, patientId);
}

/**
 * Resolve the patients to include based on a subject or subjectGroup parameter.
 * @param {string} subject reference to a subject (Patient or Group) on the server
 * @param {Object} subjectGroup FHIR Group that defines a set of patients as the subject
 * @returns {Promise<string[]>} Patient ids.
 */
export async function getPatientIds(subject: string, subjectGroup: fhir4.Group): Promise<string[]> {
  if (subject) {
    const [resourceType, id] = subject.split('/');
    if (resourceType === 'Patient' && id) {
      return [id];
    }
    if (resourceType === 'Group' && id) {
      const group = (await findResourceById(id, 'Group')) as unknown as fhir4.Group;
      if (!group) {
        throw new ResourceNotFoundError(`No resource found in collection: Group, with: id ${id}.`);
      }
      return getPatientIdsFromGroup(group);
    }
  } else if (subjectGroup) {
    return getPatientIdsFromGroup(subjectGroup);
  }
  return findResourceIdsWithQuery({}, 'Patient');
}

/**
 * Extract Patient ids from a Group resource.
 * @param {Object} group FHIR Group resource
 * @returns {string[]} Patient ids.
 */
export function getPatientIdsFromGroup(group: fhir4.Group): string[] {
  if (!group.member || group.member.length === 0) {
    throw new BadRequestError('Parameter subjectGroup or referenced Group must contain members.');
  }
  return group.member.map(member => {
    const reference = member.entity?.reference;
    if (!reference) {
      throw new BadRequestError('Group members must have references to Patients.');
    }
    const [resourceType, id] = reference.split('/');
    if (resourceType !== 'Patient' || !id) {
      throw new BadRequestError('Group members may only be Patient resource references of format "Patient/{id}".');
    }
    return id;
  });
}

/**
 * Pulls data for a set of patient-specific data requirements from the provided Endpoint and stores returned resources.
 * @param {Object} patientDR patient-specific data requirements
 * @param {Object} dataEndpoint FHIR Endpoint resource
 * @param {string} baseVersion FHIR base version
 * @returns {Promise<Object[]>} Resource Reference object created from the results of Endpoint queries.
 */
export async function pullResourceReferences(
  patientDR: DRCalculationOutput,
  dataEndpoint: fhir4.Endpoint,
  baseVersion: string
): Promise<fhir4.Reference[]> {
  const queries = _.uniq(
    patientDR.results.dataRequirement?.flatMap(dr => {
      return (
        dr.extension
          ?.filter(e => e.url === 'http://hl7.org/fhir/us/cqfmeasures/StructureDefinition/cqfm-fhirQueryPattern')
          .map(e => `${dataEndpoint.address}${e.valueString}`) ?? []
      );
    }) ?? []
  );
  const serverUrl = `${process.env.BASE_URL}/${baseVersion}`;

  // Track an array of references for the resources returned from each query
  const resourceReferenceArrays = await Promise.all(
    queries.map(async query => {
      const bundle = await axios.get(query).then(response => response.data);
      if (bundle.entry) {
        const originalReferences = bundle.entry?.map((e: fhir4.BundleEntry) =>
          e.resource?.resourceType && e.resource?.id ? `${e.resource.resourceType}/${e.resource.id}` : null
        );
        //TODO: ideally do a POST-based transaction bundle implementation (currently PUT), which may replace references with new ids
        const results = await uploadResourcesFromBundle(bundle.entry, baseVersion);
        // Get new ids
        const references = originalReferences
          .map((refString: string, i: number) => {
            if (!refString) return null;
            // Note: newRef may be an operation outcome if there are issues uploading the resource. Leaving this behavior as is for now.
            const newRef =
              results[i].resource?.resourceType && results[i].resource?.id
                ? `${results[i].resource.resourceType}/${results[i].resource.id}`
                : null;
            return {
              reference: refString,
              identifier: {
                system: serverUrl,
                value: newRef
              }
            };
          })
          .filter(Boolean);
        return references;
      }
      return [];
    })
  );
  return _.uniqBy(resourceReferenceArrays.flat(), r => JSON.stringify(r));
}

/**
 * Build a DEQM data exchange MeasureReport for the resources collected for a patient/measure pair.
 * @param {Object} measureBundle FHIR Bundle containing a Measure resource
 * @param {Object} period Measurement period with start and end
 * @param {string} subjectReference FHIR Reference to subject (a Patient)
 * @param {Object[]} resourceReferences FHIR References to resources returned from data collection queries
 * @returns {Object} FHIR MeasureReport
 */
export function createDataExchangeMeasureReport(
  measureBundle: fhir4.Bundle,
  period: fhir4.Period,
  subjectReference: fhir4.Reference,
  resourceReferences: fhir4.Reference[]
): fhir4.MeasureReport {
  const measure = measureBundle.entry?.find(e => e.resource?.resourceType === 'Measure')?.resource as fhir4.Measure;
  return {
    resourceType: 'MeasureReport',
    id: uuidv4(),
    measure: measure.url?.includes('|') ? measure.url : `${measure.url}|${measure.version}`, //canonical measure/version
    period: period,
    status: 'complete',
    type: 'data-collection',
    subject: subjectReference,
    date: new Date().toISOString(),
    reporter: { reference: 'Organization/deqm-test-server' },
    meta: {
      profile: ['http://hl7.org/fhir/uv/deqm/StructureDefinition/deqm-dataexchangemeasurereport']
    },
    extension: [
      {
        url: 'http://hl7.org/fhir/uv/deqm/StructureDefinition/deqm-submitDataUpdateType"',
        valueCode: 'snapshot'
      }
    ],
    evaluatedResource: resourceReferences,
    contained: [{ resourceType: 'Organization', id: 'deqm-test-server' }]
  };
}

/**
 * Wraps groups of measureReports in a Bundle, where each Bundle is grouped by subject, then wraps each Bundle in a return parameter
 * @param {Array<Object>} measureReportsArray An array where each entry is an array of measureReports associated with a specific subject.
 * @returns {Object} A FHIR Parameters resource containing one parameter per Bundle, where each parameter/bundle contains all measure reports for a single subject.
 */
export function wrapReportsInBundlesParameters(measureReportsArray: fhir4.MeasureReport[][]): fhir4.Parameters {
  const parameterArray = measureReportsArray.map(measureReports => {
    const bundle: fhir4.Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: measureReports.map(report => ({
        resource: report
      }))
    };

    // every parameter has name 'return'
    return {
      name: 'return',
      resource: bundle
    };
  });

  return {
    resourceType: 'Parameters',
    parameter: parameterArray
  };
}

/**
 * Creates a query that searches for the program parameter as either a code or text element
 * @param {string} program program parameter of single code or text format
 * @returns {Object} the query data that searches for this program parameter
 */
export function basicProgramQuery(program: string) {
  return {
    useContext: {
      $elemMatch: {
        'code.code': 'program',
        $or: [{ 'valueCodeableConcept.coding.code': program }, { 'valueCodeableConcept.text': program }]
      }
    }
  };
}

/**
 * Creates a query for a system|code formatted program parameter
 * @param {string} program program parameter of system|code format
 * @returns {Object} the query data that searches for this program parameter
 */
export function systemCodeProgramQuery(program: string) {
  const [system, code] = program.split('|');
  return {
    useContext: {
      $elemMatch: {
        'code.code': 'program',
        'valueCodeableConcept.coding': {
          $elemMatch: {
            code: code,
            system: system
          }
        }
      }
    }
  };
}

/**
 * Determines the type of identifier used by the client to identify the measure and returns it
 * @param {Object} query http request query
 * @param {boolean} isForQb flag to indicate if the result will be used by the query build
 * or for a mongo query
 * @returns {Object} an object containing the measure identifier with the appropriate key
 */
export function retrieveSearchTerm(query: Record<string, unknown>, isForQb: boolean) {
  const { measureId, measureIdentifier, measureUrl } = query;
  if (measureId) {
    //some manipulation will be needed here because _id means a generated id when interacting with mongo
    //however if this field is used with the Asymmetrik query builder it means the actual id of the measure
    // this overlap can cause some confusion
    return isForQb ? { _id: measureId } : { id: measureId };
  } else if (measureIdentifier) {
    return { identifier: measureIdentifier };
  } else if (measureUrl) {
    return { url: measureUrl };
  } else {
    return null;
  }
}

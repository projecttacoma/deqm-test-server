const { constants } = require('@projecttacoma/node-fhir-server-core');
const path = require('path');
const supportedResources = require('../server/supportedResources');
const { buildServiceModule } = require('../services/base.service');

const { VERSIONS } = constants;

/**
 * Build configuration object to pass to the core FHIR server
 *
 * @returns Server configuration.
 */
const buildConfig = () => {
  const config = {
    profiles: {}
  };
  supportedResources.forEach(resourceType => {
    switch (resourceType) {
      case 'Patient':
        config.profiles['Patient'] = {
          service: path.resolve('src', 'services', 'patient.service.js'),
          versions: [VERSIONS['4_0_1']],
          operation: [
            {
              name: 'patientEverything',
              route: '/$everything',
              method: 'GET',
              reference: 'https://www.hl7.org/fhir/operation-patient-everything.html'
            },
            {
              name: 'patientEverything',
              route: '/$everything',
              method: 'POST',
              reference: 'https://www.hl7.org/fhir/operation-patient-everything.html'
            },
            {
              name: 'patientEverything',
              route: '/:id/$everything',
              method: 'GET',
              reference: 'https://www.hl7.org/fhir/operation-patient-everything.html'
            },
            {
              name: 'patientEverything',
              route: '/:id/$everything',
              method: 'POST',
              reference: 'https://www.hl7.org/fhir/operation-patient-everything.html'
            }
          ]
        };
        break;
      case 'Measure':
        config.profiles['Measure'] = {
          service: path.resolve('src', 'services', 'measure.service.js'),
          versions: [VERSIONS['4_0_1']],
          operation: [
            {
              name: 'submitData',
              route: '/$submit-data',
              method: 'POST',
              reference: 'https://hl7.org/fhir/operation-measure-submit-data.html'
            },
            {
              name: 'submitData',
              route: '/:id/$submit-data',
              method: 'POST',
              reference: 'https://hl7.org/fhir/operation-measure-submit-data.html'
            },
            {
              name: 'bulkSubmitData',
              route: '/$bulk-submit-data',
              method: 'POST',
              reference: 'https://hl7.org/fhir/us/davinci-deqm/STU5/OperationDefinition-bulk-submit-data.html'
            },
            {
              name: 'bulkSubmitData',
              route: '/:id/$bulk-submit-data',
              method: 'POST',
              reference: 'https://hl7.org/fhir/us/davinci-deqm/STU5/OperationDefinition-bulk-submit-data.html'
            },
            {
              name: 'dataRequirements',
              route: '/:id/$data-requirements',
              method: 'GET',
              reference: 'https://www.hl7.org/fhir/measure-operation-data-requirements.html'
            },
            {
              name: 'dataRequirements',
              route: '/:id/$data-requirements',
              method: 'POST',
              reference: 'https://www.hl7.org/fhir/measure-operation-data-requirements.html'
            },
            {
              name: 'evaluateMeasure',
              route: '/:id/$evaluate',
              method: 'GET',
              reference: 'https://hl7.org/fhir/us/davinci-deqm/STU5/OperationDefinition-evaluate.html'
            },
            {
              name: 'evaluateMeasure',
              route: '/:id/$evaluate',
              method: 'POST',
              reference: 'https://hl7.org/fhir/us/davinci-deqm/STU5/OperationDefinition-evaluate.html'
            },
            {
              name: 'evaluateMeasure',
              route: '/$evaluate',
              method: 'GET',
              reference: 'https://hl7.org/fhir/us/davinci-deqm/STU5/OperationDefinition-evaluate.html'
            },
            {
              name: 'evaluateMeasure',
              route: '/$evaluate',
              method: 'POST',
              reference: 'https://hl7.org/fhir/us/davinci-deqm/STU5/OperationDefinition-evaluate.html'
            },
            {
              name: 'careGaps',
              route: '/$care-gaps',
              method: 'GET',
              reference: 'https://build.fhir.org/ig/HL7/davinci-deqm/OperationDefinition-care-gaps.html'
            },
            {
              name: 'careGaps',
              route: '/$care-gaps',
              method: 'POST',
              reference: 'https://build.fhir.org/ig/HL7/davinci-deqm/OperationDefinition-care-gaps.html'
            }
          ]
        };
        break;
      default:
        config.profiles[resourceType] = {
          service: buildServiceModule(resourceType),
          versions: [VERSIONS['4_0_1']]
        };
    }
  });
  return config;
};

module.exports = { buildConfig };

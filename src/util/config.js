const { constants } = require('@asymmetrik/node-fhir-server-core');
const { VERSIONS } = constants;
const supportedResources = require('./supportedResources');
const { buildServiceModule } = require('../services/base.service');
const path = require('path');

/**
 * Build configuration object to pass to the Asymmetrik core FHIR server
 *
 * @returns Server configuration.
 */
const buildConfig = () => {
  const config = {
    profiles: {}
  };
  supportedResources.forEach(resourceType => {
    switch (resourceType) {
      case 'Measure':
        config.profiles['Measure'] = {
          service: path.resolve('src', 'services', 'measure.service.js'),
          versions: [VERSIONS['4_0_0']],
          operation: [
            {
              name: 'submitData',
              route: '/$submit-data',
              method: 'POST',
              reference: 'http://hl7.org/fhir/OperationDefinition/Measure-submit-data'
            },
            {
              name: 'submitData',
              route: '/:id/$submit-data',
              method: 'POST',
              reference: 'http://hl7.org/fhir/OperationDefinition/Measure-submit-data'
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
              route: '/:id/$evaluate-measure',
              method: 'GET',
              reference: 'https://www.hl7.org/fhir/measure-operation-evaluate-measure.html'
            },
            {
              name: 'careGaps',
              route: '/$care-gaps',
              method: 'GET',
              reference: 'https://build.fhir.org/ig/HL7/davinci-deqm/OperationDefinition-care-gaps.html'
            }
          ]
        };
        break;
      default:
        config.profiles[resourceType] = {
          service: buildServiceModule(resourceType),
          versions: [VERSIONS['4_0_0']]
        };
    }
  });
  return config;
};

module.exports = { buildConfig };

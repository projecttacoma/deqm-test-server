const { constants } = require('@asymmetrik/node-fhir-server-core');
const { VERSIONS } = constants;
const supportedResources = require('./supportedResources');
const { buildServiceModule } = require('../services/base.service');
const path = require('path');
const configTransaction = require('../services/bundle.controller');

/**
 * Build configuration object to pass to the Asymmetrik core FHIR server
 *
 * @returns Server configuration.
 */
const buildConfig = () => {
  const config = {
    profiles: {},
    routes: [
      {
        type: 'post',
        path: '/:base_version/',
        corsOptions: {
          methods: ['POST']
        },
        args: [],
        controller: configTransaction.transaction
      }
    ]
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

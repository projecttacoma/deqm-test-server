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
          versions: [VERSIONS['4_0_0']]
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

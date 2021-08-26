const { constants } = require('@asymmetrik/node-fhir-server-core');
const { VERSIONS } = constants;
const supportedResources = require('./supportedResources');
const { buildServiceModule } = require('../services/base.service');

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

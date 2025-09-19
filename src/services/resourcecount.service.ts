//@ts-nocheck 
const { getCountOfCollection } = require('../database/dbOperations');
const supportedResources = require('../server/supportedResources');

/**
 * retrieves counts for each resourceType and then formats and returns all counts as resourceType:count key:value pairs
 * @returns key:value pairs of resourceTypes and their counts
 */
const getAllResourceCounts = async () => {
  const allCounts = supportedResources.map(async resourceType => {
    return { resourceType, count: await getCountOfCollection(resourceType) };
  });
  const allResourceCounts = await Promise.all(allCounts);

  const resourceCountPairs = {};
  allResourceCounts.forEach(el => (resourceCountPairs[el.resourceType] = el.count));
  return resourceCountPairs;
};

module.exports = {
  getAllResourceCounts
};

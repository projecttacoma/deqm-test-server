const fs = require('fs');
const path = require('path');

const compartmentDefPath = path.resolve(
  path.join(__dirname, '../compartment-definition/compartmentdefinition-patient.json')
);
const outputPath = path.resolve(path.join(__dirname, '../compartment-definition/patient-references.json'));
const jsonStr = fs.readFileSync(compartmentDefPath, 'utf8');
const { getSearchParameters } = require('@asymmetrik/node-fhir-server-core/dist/server/utils/params.utils');

/**
 * Parse Patient compartment definition for search parameter keywords
 * @param {string} compartmentJson the string content of the patient compartment definition json file
 * @return object whose keys are resourceTypes and values are arrays of strings to use to reference a patient
 */
async function parse(compartmentJson) {
  const compartmentDefinition = await JSON.parse(compartmentJson);
  const results = {};
  compartmentDefinition.resource.forEach(resourceObj => {
    if (resourceObj.param) {
      results[resourceObj.code] = [];
      const searchParameterList = getSearchParameters(resourceObj.code, '4_0_0').filter(objs =>
        resourceObj.param?.includes(objs.name)
      );
      searchParameterList.forEach(obj => {
        // retrieve xpath and remove resource type from beginning
        results[resourceObj.code].push(obj.xpath.substr(obj.xpath.indexOf('.') + 1));
      });
    }
  });
  return results;
}

parse(jsonStr)
  .then(data => {
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');

    console.log(`Wrote file to ${outputPath}`);
  })
  .catch(e => {
    console.error(e);
  });

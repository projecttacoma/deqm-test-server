const fs = require('fs');
const path = require('path');

const compartmentDefPath = path.resolve(
  path.join(__dirname, '../compartment-definition/compartmentdefinition-patient.json')
);
const outputPath = path.resolve(path.join(__dirname, '../compartment-definition/patient-references.json'));
const jsonStr = fs.readFileSync(compartmentDefPath, 'utf8');
const {
  getSearchParameters,
  getParameters
} = require('@asymmetrik/node-fhir-server-core/dist/server/utils/params.utils');

/**
 * Parse Patient compartment definition for search parameter keywords
 * @param {string} compartmentJson the string content of the patient compartment definition json file
 * @return object whose keys are resourceTypes and values are arrays of strings to use to reference a patient
 */
async function parse(compartmentJson, base_version) {
  console.log(base_version);
  const compartmentDefinition = await JSON.parse(compartmentJson);

  const results = {};
  compartmentDefinition.resource.forEach(resourceObj => {
    //console.log(resourceObj.code);
    // array of objs
    const ignores = [
      'BiologicallyDerivedProduct',
      'CatalogEntry',
      'Evidence',
      'EvidenceVariable',
      'MedicinalProductIngredient',
      'MedicinalProductInteraction',
      'MedicinalProductManufactured',
      'MedicinalProductUndesirableEffect',
      'ObservationDefinition',
      'OperationOutcome',
      'SubstanceNucleicAcid',
      'SubstancePolymer',
      'SubstanceProtein',
      'SubstanceReferenceInformation',
      'SubstanceSourceMaterial'
    ];
    if (!ignores.includes(resourceObj.code)) {
      //console.log(resourceObj.code);
      results[resourceObj.code] = [];
      const searchParameterList = getSearchParameters(resourceObj.code, '4_0_0').filter(objs =>
        resourceObj.param?.includes(objs.name)
      );
      searchParameterList.forEach(obj => {
        results[resourceObj.code].push(obj.xpath);
      });
    }

    //console.log(searchParameterList);
    //searchParameterList.filter(objs => resourceObj.param.includes(objs.name));

    // searchParameterList.forEach(async paramDef => {
    //   console.log(resourceObj.param);
    //   console.log(paramDef.name);
    //weWant = paramDef.filter(obj => resourceObj.param.includes(obj.name));
    // });
    //console.log(weWant);

    // if (resourceObj.param) {
    //   results[resourceObj.code] = resourceObj.param;
    // } else {
    //   results[resourceObj.code] = [];
    // }
  });
  console.log(results);

  //   if (!paramDefs) {
  //     searchParams = {};
  //     const searchParameterList = getSearchParameters(resourceType, '4_0_0');
  //     searchParameterList.forEach(async paramDef => {
  //       {
  //         searchParams[paramDef.name] = paramDef;
  //       }
  //     });
  //   } else {
  //     searchParams = paramDefs;
  //   }

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

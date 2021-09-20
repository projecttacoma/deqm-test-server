const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

const modelInfoPath = path.resolve(path.join(__dirname, '../model-info/fhir-modelinfo-4.0.1.xml'));
const outputPath = path.resolve(path.join(__dirname, '../model-info/patient-references.json'));
const xmlStr = fs.readFileSync(modelInfoPath, 'utf8');

// Certain cases won't be handled by our lookup
const IGNORED_REFS = ['where(resolve() is Patient)'];

/**
 * Parse FHIR model info XML and output a map of resourceType => patient reference attributes
 * @param {string} xml the string content of the model info XML to parse
 * @return object whose keys are resourceTypes and values are arrays of strings to use to reference a patient
 */
async function parse(xml) {
  const { modelInfo } = await xml2js.parseStringPromise(xml);
  const domainInfo = modelInfo.typeInfo.filter(ti => ti.$.baseType === 'FHIR.DomainResource');

  const res = {};

  domainInfo.forEach(di => {
    const resourceType = di.$.name;

    // Find all ways that a patient is referenced for this resourceType
    if (di.contextRelationship) {
      const contextRelationships = di.contextRelationship
        .filter(cr => cr.$.context === 'Patient')
        .map(cr => cr.$.relatedKeyElement)
        .filter(cr => !IGNORED_REFS.includes(cr));

      res[resourceType] = contextRelationships;
    }
  });

  return res;
}

parse(xmlStr)
  .then(data => {
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');

    console.log(`Wrote file to ${outputPath}`);
  })
  .catch(e => {
    console.error(e);
  });

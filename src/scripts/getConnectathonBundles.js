const fs = require('fs');
const path = require('path');
const mongoUtil = require('../database/connection');
const { createResource } = require('../database/dbOperations');

const connectathonPath = path.resolve(path.join(__dirname, '../../connectathon/fhir401/bundles/measure/'));
// bundles that are not the latest available version
const IGNORED_BUNDLES = [
  'EXM347-3.2.000-bundle.json',
  'EXM347-4.3.000-bundle.json',
  'EXM529-1.0.000-bundle.json',
  'EXM349-2.10.000-bundle.json',
  'EXM111-9.1.000-bundle.json',
  'EXM149-9.2.000-bundle.json'
];

// files containing EXM bundles of interest from connectathon repo
const bundleFiles = [];

/**
 * Retrieves EXM bundle files from the connectathon repo using a regular expression.
 * Uses recursion to parse through all available subdirectories.
 * @param {string} directory - directory path to start at
 * @returns {Array} array of string paths that represent the bundle files of interest
 */
const getBundleFiles = directory => {
  const fileNameRegExp = new RegExp(/(^EXM.*.json$)/);
  const filesInDirectory = fs.readdirSync(directory);
  filesInDirectory.forEach(file => {
    const absolute = path.join(directory, file);
    if (fs.statSync(absolute).isDirectory()) {
      getBundleFiles(absolute);
    } else if (fileNameRegExp.test(file) && !IGNORED_BUNDLES.includes(file)) {
      bundleFiles.push(absolute);
    }
  });
};

/**
 * Uploads all the resources from the connectathon measure bundles into the
 * database.
 *
 * TODO: Currently configured for fhir401 connectathon measure bundles,
 * but may want to expand to other measure bundle providers in the future.
 */
async function main() {
  await mongoUtil.client.connect();
  console.log('Connected successfully to server');

  try {
    getBundleFiles(connectathonPath);
  } catch (e) {
    throw new Error(
      'Connectathon directory not found. Git clone the connectathon repo into the root directory and run script again'
    );
  }

  const bundlePromises = bundleFiles.map(async filePath => {
    // read each EXM bundle file
    const data = fs.readFileSync(filePath, 'utf8');
    if (data) {
      const bundle = JSON.parse(data);
      // retrieve each resource and insert into database
      const uploads = bundle.entry.map(async res => {
        try {
          await createResource(res.resource, res.resource.resourceType);
        } catch (e) {
          // ignore duplicate key errors for Libraries, ValueSets
          if (e.code !== 11000 || res.resource.resourceType === 'Measure') {
            console.log(e.message);
          }
        }
      });
      await Promise.all(uploads);
    }
  });
  await Promise.all(bundlePromises);
  return 'Connectathon bundle entries uploaded.';
}

main()
  .then(console.log)
  .catch(console.error)
  .finally(async () => await mongoUtil.client.close());

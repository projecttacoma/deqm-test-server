const fs = require('fs');
const path = require('path');
const mongoUtil = require('../database/connection');
const { createResource } = require('../database/dbOperations');

const ecqmContentR4Path = path.resolve(path.join(__dirname, '../../ecqm-content-r4-2021/bundles/measure/'));

// files containing EXM bundles of interest from specified directory
const bundleFiles = [];

/**
 * Retrieves all measure bundle files from the passed in directory that match the passed in regex
 * Uses recursion to parse through all available subdirectories.
 * @param {string} directory - directory path to start at
 * @param {string} searchPattern - regex to match potential measure bundle files against
 * @returns {Array} array of string paths that represent the bundle files of interest
 */
const getEcqmBundleFiles = (directory, searchPattern) => {
  const fileNameRegExp = new RegExp(searchPattern);
  const filesInDirectory = fs.readdirSync(directory);
  filesInDirectory.forEach(file => {
    const absolute = path.join(directory, file);
    if (fs.statSync(absolute).isDirectory()) {
      getEcqmBundleFiles(absolute, searchPattern);
    } else if (fileNameRegExp.test(file)) {
      bundleFiles.push(absolute);
    }
  });
};

/**
 * Retrieves bundle files from arbitrary folder using a regular expression.
 * Uses recursion to parse through all available subdirectories.
 * @param {string} directory - directory path to start a
 * @param {string} searchPattern - regex to match potential measure bundle files against
 * @returns {Array} array of string paths that represent the bundle files of interest
 */
const getBundleFiles = (directory, searchPattern) => {
  const fileNameRegExp = new RegExp(searchPattern);
  const filesInDirectory = fs.readdirSync(directory);
  filesInDirectory.forEach(file => {
    const absolute = path.join(directory, file);
    if (fs.statSync(absolute).isDirectory()) {
      getBundleFiles(absolute, searchPattern);
    } else if (
      fileNameRegExp.test(file) &&
      !file.endsWith('MeasureReport.json') &&
      !file.endsWith('measure-report.json')
    ) {
      bundleFiles.push(absolute);
    }
  });
};

/**
 * Uploads all the resources from the specified directory into the
 * database.
 *
 * TODO: Currently configured for ecqm-content-r4-2021 measure bundles,
 * but may want to expand to other measure bundle providers in the future.
 */
async function main() {
  await mongoUtil.client.connect();
  console.log('Connected successfully to server');
  // default searchPattern to retrieve all filenames that begin with a capital letter and end with -bundle.json
  let searchPattern;
  if (process.argv[3]) {
    searchPattern = process.argv[3];
  }
  if (process.argv[2]) {
    // if a path is provided
    const bundlePath = path.resolve(process.argv[2]);
    try {
      if (!searchPattern) {
        searchPattern = /.json$/;
      }
      console.log(`Finding bundles in ${bundlePath}.`);
      getBundleFiles(bundlePath, searchPattern);
    } catch (e) {
      throw new Error('Provided directory not found.');
    }

    // otherwise load from ecqm-content-r4-2021
  } else {
    try {
      if (!searchPattern) {
        searchPattern = /^[A-Z].*-bundle.json$/;
      }
      console.log(`Finding bundles in ecqm-content-r4-2021 repo at ${ecqmContentR4Path}.`);
      getEcqmBundleFiles(ecqmContentR4Path, searchPattern);
    } catch (e) {
      throw new Error(
        'ecqm-content-r4-2021 directory not found. Git clone the ecqm-content-r4-2021 repo into the root directory and run script again'
      );
    }
  }
  let filesUploaded = 0;
  let resourcesUploaded = 0;
  for (const filePath of bundleFiles) {
    // read each EXM bundle file
    const data = fs.readFileSync(filePath, 'utf8');
    if (data) {
      console.log(`Uploading ${filePath.split('/').slice(-1)}...`);
      const bundle = JSON.parse(data);
      // retrieve each resource and insert into database
      const uploads = bundle.entry.map(async res => {
        try {
          await createResource(res.resource, res.resource.resourceType);
          resourcesUploaded += 1;
        } catch (e) {
          // ignore duplicate key errors for Libraries, ValueSets
          if (e.code !== 11000 || res.resource.resourceType === 'Measure') {
            console.log(e.message);
          }
        }
      });
      await Promise.all(uploads);
      filesUploaded += 1;
    }
  }
  return `${resourcesUploaded} resources uploaded from ${filesUploaded} Bundle files.`;
}

main()
  .then(console.log)
  .catch(console.error)
  .finally(async () => await mongoUtil.client.close());

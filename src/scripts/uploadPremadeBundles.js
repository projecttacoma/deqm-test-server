const fs = require('fs');
const path = require('path');
const mongoUtil = require('../database/connection');
const { createResource, updateResource } = require('../database/dbOperations');
const { v4: uuidv4 } = require('uuid');

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

const addTestResources = async () => {
  await createResource(
    {
      resourceType: 'Group',
      id: 'Cervical-patients',
      type: 'person',
      actual: 'true',
      member: [
        {
          entity: {
            reference: 'Patient/denom-EXM124'
          }
        },
        {
          entity: {
            reference: 'Patient/numer-EXM124'
          }
        }
      ]
    },
    'Group'
  );
  await createResource(
    {
      resourceType: 'Organization',
      id: '1'
    },
    'Organization'
  );
  await createResource(
    {
      resourceType: 'Practitioner',
      id: '1'
    },
    'Practitioner'
  );

  await updateResource(
    'denom-EXM124',
    {
      resourceType: 'Patient',
      id: 'denom-EXM124',
      managingOrganization: {
        reference: 'Organization/1'
      },
      generalPractitioner: {
        reference: 'Practitioner/1'
      }
    },
    'Patient'
  );
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

  // --test assumes default for all other parameters
  const test = process.argv[2] === '--test';

  // default searchPattern to retrieve all filenames that begin with a capital letter and end with -bundle.json
  let searchPattern;
  if (process.argv[3] && !test) {
    searchPattern = process.argv[3];
  }
  if (process.argv[2] && !test) {
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
    // read each bundle file
    const data = fs.readFileSync(filePath, 'utf8');
    if (data) {
      const bundle = JSON.parse(data);
      if (bundle.resourceType !== 'Bundle') {
        console.log(`Skipping ${filePath.split('/').slice(-1)} NOT A BUNDLE`);
        continue;
      }

      // uncomment if you want to see every bundle found that this script is processing
      //console.log(`Uploading ${filePath.split('/').slice(-1)}...`);

      // retrieve each resource and insert into database
      const uploads = bundle.entry.map(async res => {
        try {
          // If there is no ID... make one. This probably is a MADiE Export Measure resource. Try to grab the first
          // chunk from the filename looking for the `-` to hopefully get `CMSXXXFHIR` otherwise use a random ID
          if (!res.resource.id) {
            res.resource.id = filePath.split('/').slice(-1)[0].split('-')[0] || uuidv4();
            console.log(`Gave ${res.resource.resourceType} an ID of ${res.resource.id}`);
          }
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
  if (test) {
    await addTestResources();
    console.log('Added test resources.');
  }

  return `${resourcesUploaded} resources uploaded from ${filesUploaded} Bundle files.`;
}

main()
  .then(console.log)
  .catch(console.error)
  .finally(async () => await mongoUtil.client.close());

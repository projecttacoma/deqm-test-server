const fs = require('fs');
const path = require('path');

const connectathonPath = path.resolve(path.join(__dirname, '../../connectathon/fhir401/bundles/measure/'));

/**
 * Sends POST requests to the transaction bundle endpoint for every measure in the
 * connectathon repo.
 *
 * TODO: Currently configured for fhir401 connectathon measure bundles,
 * but may want to expand to other measure bundle providers in the future.
 */
async function main() {
  console.log('hey');
  console.log(connectathonPath);
  // first try to just parse through the repo and get the measure bundle for each bundle
  fs.readdir(connectathonPath, function (err, subDirs) {
    if (err) {
      console.error('could not access directories within connectathon repo');
    }

    subDirs.forEach(dir => {
      // this works
      console.log(dir);
    });
  });
}

main()
  .catch(console.error)
  .catch(e => {
    console.error(e);
  });
//.finally(() => mongoUtil.client.close());

import FHIRClient from './fhirClient';

async function runTest() {
  const client = new FHIRClient('https://inferno.healthit.gov/reference-server/r4');

  const bundle = await client.get<fhir4.Bundle>('/Patient');
  console.log(bundle);
}

runTest();

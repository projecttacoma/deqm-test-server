# Data Exchange for Quality Measures (DEQM) Test Server

Test server for executing FHIR-based Electronic Clinical Quality Measures (eCQMs).

- [Installation](#installation)

  - [Prerequisites](#prerequisites)
  - [Local Installation](#local-installation)
  - [Testing](#testing)
  - [MongoDB](#mongodb)
  - [Docker](#docker)

- [Usage](#usage)

  - [Database Setup](#database-setup)
  - [CRUD Operations](#crud-operations)
  - [Searches](#searches)
  - [Supported FHIR Operations](#supported-fhir-operations)
  - [Bulk Data Access](#bulk-data-access)

- [License](#license)

## Installation

### Prerequisites

- [Node.js >=11.15.0](https://nodejs.org/en/)
- [MongoDB >= 5.0](https://www.mongodb.com)
- [Git](https://git-scm.com/)
- [Docker](https://docs.docker.com/get-docker/)

### Local Installation

Clone the source code:

```bash
git clone https://github.com/projecttacoma/deqm-test-server.git
```

Install dependencies:

```bash
npm install
```

### Testing

Unit tests can be running using the following `npm` command:

```bash
npm run test
```

### MongoDB

This test server makes use of [MongoDB](https://www.mongodb.com), a cross-platform document-oriented database program.

Follow the [MongoDB Community Edition installation guide](https://docs.mongodb.com/manual/installation/) for your platform, and follow the commands for running MongoDB on your machine.

### Docker

This test server can be run with Docker by calling `docker-compose up --build`.
Debugging with terminal input can be facilitated with `stdin_open: true` and `tty: true` added to the service specification for the service you want to debug. You can then attach to the image of interest using `docker attach <imagename>`. If you're unsure of the image name, use `docker ps` to find the image of interest.

## Usage

Once MongoDB is running on your machine, run the `npm start` command to start up the FHIR server at `localhost:3000`. The server can also be run in "watch" mode with `npm run start:watch`.

For ease of testing, it is recommended to download [Insomnia API Client and Design Tool](https://insomnia.rest) for sending HTTP requests to the server and [Robo 3T](https://robomongo.org) as a GUI for viewing the Mongo database.

When sending requests, ensure that the `"Content-type": "application/json+fhir"` header is set. For sending POST/PUT requests, ensure that the `"X-Provenance"` is populated with a valid JSON object with the `resourceType` key set to `"Provenance"`.

### Database Setup

The following `npm` commands can be used to set up the database:

- `npm run db:setup` creates collections for all the valid FHIR resource types
- `npm run db:delete` deletes all existing collections in the database
- `npm run db:reset` runs both of the above, deleting all current collections and then creating new, empty collections
- To upload all the Connectathon measure bundles, `git clone` the [Connectathon repository](https://github.com/DBCG/connectathon) into the root directory of the `deqm-test-server` repository. Run `npm run connectathon-upload`. This runs a script that uploads all the Connectathon bundle resources to the appropriate Mongo collections.

### CRUD Operations

The test server supports the following operations: create, read, update, and delete, search, and transaction. See the [FHIR CRUD Operations documentation](https://www.hl7.org/fhir/http.html) for more information.

### Searches

The test server's Measure searching capabilities support searches by name, version, both, or neither.

- `GET http://localhost:3000/4_0_1/Measure/` returns all Measures currently in the database
- `GET http://localhost:3000/4_0_1/Measure?name=NAME` returns all Measures in the database with name `NAME`
- `GET http://localhost:3000/4_0_1/Measure?NAME&version=VERSION` returns all Measures in the database with name `NAME` and version `VERSION`

The test server's resource searching capabilities support searches by identifier.

- `GET http://localhost:3000/4_0_1/RESOURCETYPE/?identifier=ID` returns bundle entries of resource type `RESOURCETYPE` that have the identifier `ID`. Errors are thrown when an identifier is not included. An empty searchset is returned if the identifier cannot be found in the database.

### Supported FHIR Operations

#### `$evaluate-measure`

This operation calculates a measure for a given patient. Currently, individual measure reports are supported. Subject-list and population measure reports are not yet supported.

Required parameters include:

- `periodStart`: start of the measurement period
- `periodEnd`: end of the measurement period
- `subject`: subject for which the measure will be calculated (unless a `population` `reportType` is specified)

Currently, `measure`, `practitioner`, and `lastReceivedOn` parameters are not supported by the test server. The `subject-list` `reportType` is not supported by the test server - only `individual` and `population` `reportTypes` are supported at this time.

To use, first POST a measure bundle into your database, then send a GET request to `http://localhost:3000/4_0_1/Measure/<your-measure-id>/$evaluate-measure` with the required parameters.

Check out the [$evaluate-measure operation spec](https://www.hl7.org/fhir/measure-operation-evaluate-measure.html) for more infomration.

#### `$care-gaps`

This operation calculates gaps in care for a given patient against the given measure.

Required parameters include:

- `periodStart`: start of the measurement period
- `periodEnd`: end of the measurement period
- `subject`: subject for which the measure will be calculated
- `status`: status of the care gap

Currently, `topic`, `practitioner`, `organization`, and `program` are not supported by the test server.

To use, first POST a measure bundle into your database, then send a GET request to `http://localhost:3000/4_0_1/Measure/$care-gaps` with the required parameters.

Check out the [$care-gaps operation spec](https://build.fhir.org/ig/HL7/davinci-deqm/OperationDefinition-care-gaps.html) for more infomration.

#### `$data-requirements`

This operation retrieves all the data requirements for a given measure as a FHIR library.

Required parameters include:

- `periodStart`: start of the measurement period
- `periodEnd`: end of the measurement period

To use, first POST a measure bundle into your database, then send a GET request to `http://localhost:3000/4_0_1/Measure/<your-measure-id>/$data-requirements`.

Check out the [$data-requirements operation spec](https://www.hl7.org/fhir/measure-operation-data-requirements.html) for more infomration.

#### `$submit-data`

This operation takes a Measure Report and a set of required data with which to calculate the measure, and the server adds new documents to the database for each contained FHIR object. To use, send a valid FHIR parameters object in a POST request to `http://localhost:3000/4_0_1/Measure/$submit-data` or `http://localhost:3000/4_0_1/Measure/<your-measure-id>/$submit-data`.

Check out the [$submit-data operation spec](https://www.hl7.org/fhir/measure-operation-submit-data.html) for more information.

#### `Patient/$everything`

This operation returns a searchset bundle containing all the information related to a patient. If no patient ID is specified, bundle will contain information for all patients.

To use, first POST a bundle into your database, then send a GET request to `http://localhost:3000/4_0_1/Patient/<your-patient-id>/$everything` or `http://localhost:3000/4_0_1/Patient/$everything`.

Check out the [Patient-everything operation spec](https://www.hl7.org/fhir/operation-patient-everything.html) for more information.

### Bulk Data Access

The server contains functionality for the FHIR Bulk Data Import operation using the [Ping and Pull Approach](https://github.com/smart-on-fhir/bulk-import/blob/master/import-pnp.md).

To implement a bulk data import operation of all the resources on a FHIR Bulk Data Export server, POST a valid FHIR parameters object to `http://localhost:3000/$import`. Use the parameter format below to specify a bulk export server.

To implement the bulk data import operation from the data requirements for a specific measure, first POST a valid transaction bundle. Then, POST a valid FHIR parameters object to `http://localhost:3000/4_0_1/Measure/$submit-data` or `http://localhost:3000/4_0_1/Measure/<your-measure-id>/$submit-data` with the `"prefer": "respond-async"` header populated. This will kick off the "ping and pull" bulk import.

For the bulk data import operation to be successful, the user must specify an export URL to a FHIR Bulk Data Export server in the request body of the FHIR parameters object. For example, in the `parameter` array of the FHIR parameters object, the user can include

```bash
{
     "name": "exportURL",
     "valueString": "https://example-export.com"
}
```

with a valid kickoff endpoint URL for the `valueString`.

The user can check the status of an $import or async $submit-data request by copying the content-location header in the response, and sending a GET request to `http://localhost:3000/<content-location-header>`.

## License

Copyright 2021 The MITRE Corporation

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

```bash
http://www.apache.org/licenses/LICENSE-2.0
```

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

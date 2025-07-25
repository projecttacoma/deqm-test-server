# Data Exchange for Quality Measures (DEQM) Test Server

Test server for executing FHIR-based Electronic Clinical Quality Measures (eCQMs).

- [Data Exchange for Quality Measures (DEQM) Test Server](#data-exchange-for-quality-measures-deqm-test-server)
  - [Installation](#installation)
    - [Prerequisites](#prerequisites)
    - [Local Installation](#local-installation)
    - [Testing](#testing)
    - [MongoDB](#mongodb)
    - [Redis Installation](#redis-installation)
    - [Docker](#docker)
  - [Usage](#usage)
    - [Database Setup](#database-setup)
    - [CRUD Operations](#crud-operations)
    - [Searches](#searches)
    - [Supported FHIR Operations](#supported-fhir-operations)
      - [`$evaluate`](#evaluate)
      - [`$care-gaps`](#care-gaps)
      - [`$data-requirements`](#data-requirements)
      - [`$submit-data`](#submit-data)
      - [`Patient/$everything`](#patienteverything)
    - [Bulk Import](#bulk-import)
  - [License](#license)

## Installation

### Prerequisites

- [Node.js >=16.0.0](https://nodejs.org/en/)
- [MongoDB >= 6.0](https://www.mongodb.com)
- [Git](https://git-scm.com/)
- [Docker](https://docs.docker.com/get-docker/)
- [Redis](https://redis.com/break-the-data-matrix/)

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

### Redis Installation

This server uses [Redis](https://redis.com/break-the-data-matrix/) in order to use the [bee queue](https://github.com/bee-queue/bee-queue) Node.js queue library. To install with Homebrew, run the following command:

```bash
brew install redis
```

To launch Redis, run:

```bash
brew services start redis
```

To verify the Redis server is running, ping it with:

```bash
redis-cli ping
```

You should receive the output `PONG`.

### Docker

This test server can be run with Docker by calling `docker-compose up --build`.
Debugging with terminal input can be facilitated with `stdin_open: true` and `tty: true` added to the service specification for the service you want to debug. You can then attach to the image of interest using `docker attach <imagename>`. If you're unsure of the image name, use `docker ps` to find the image of interest.

## Usage

Once MongoDB is running on your machine, run the `npm start` command to start up the FHIR server at `localhost:3000`. The server can also be run in "watch" mode with `npm run start:watch` and in "debug" mode by running `NODE_ENV=development npm start`.

DEQM test server offers optional FHIR resource validation using the Inferno FHIR Validator. The FHIR Validator acts as middleware on all `PUT` and `POST` requests that attempt to write data to the server. To set this up locally, pull and run the Inferno FHIR Validator docker image using `docker run -p 4567:4567 infernocommunity/fhir-validator-service`. Then start up the test server using `VALIDATE=true VALIDATOR_HOST=localhost VALIDATOR_PORT=4567 npm run start`. These environment variables can be changed in the .env file as well to prevent lengthy start-up commands.

For ease of testing, it is recommended to download [Insomnia API Client and Design Tool](https://insomnia.rest) for sending HTTP requests to the server and [Robo 3T](https://robomongo.org) as a GUI for viewing the Mongo database.

When sending requests, ensure that the `"Content-type": "application/json+fhir"` header is set. For sending POST/PUT requests, ensure that the `"X-Provenance"` is populated with a valid JSON object with the `resourceType` key set to `"Provenance"`.

### Database Setup

The following `npm` commands can be used to set up the database:

- `npm run db:setup` creates collections for all the valid FHIR resource types
- `npm run db:delete` deletes all existing collections in the database
- `npm run db:reset` runs both of the above, deleting all current collections and then creating new, empty collections
- To upload all the ecqm-content-r4-2021 measure bundles, `git clone` the [ecqm-content-r4-2021 repo](https://github.com/cqframework/ecqm-content-r4-2021) into the root directory of the `deqm-test-server` repository. Run `npm run upload-bundles`. This runs a script that uploads all the measure bundle resources to the appropriate Mongo collections.
- The full CLI function signature of `upload-bundles` script is `npm run upload-bundles [dirPath] [searchPattern]` OR `npm run upload-bundles --test`. The command can be run more dynamically by specifying a `dirPath` string which represents the path to a repository that contains the desired bundles for upload. `searchPattern` is a string which is used as a regex to filter bundle files for upload by file name. Example: `npm run upload-bundles connectathon/fhir401/bundles/measure "^EXM124.*-bundle.json"`. Using the `--test` option assumes defaults for these options, but also adds `Group`, `Organization`, and `Practitioner` resources for more extensive testing. `upload-bundles-test` runs the upload with the `--test` option and is provided for convenience.

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

#### `$evaluate`

This operation calculates measure(s) for a given patient or set of patients. Currently, individual and population measure reports are supported. Subject-list measure reports are not yet supported.

Required parameters include:

- `periodStart`: start of the measurement period
- `periodEnd`: end of the measurement period
- `subject`: subject is required for an `individual` `reportType` and is the subject for which a measure will be calculated
- `measureId`: Required if the measure ID is not specified in the URL. May also be a list of measure IDs if provided in a Parameters object.

Optional parameters include:

- `practitioner`: practitioner for which the measure will be calculated

Currently, `measureIdentifier`, `measureUrl`, `measure`, `measureResource` and `lastReceivedOn` parameters are not supported by the test server. The `subject-list` `reportType` is not supported by the test server - only `subject` and `population` `reportTypes` are supported at this time,
which will generate `individual` and `summary` `MeasureReport`s respectively.

To use, first POST a measure bundle into your database, then send a GET request to `http://localhost:3000/4_0_1/Measure/<your-measure-id>/$evaluate` (for a single measure) or `http://localhost:3000/4_0_1/Measure/$evaluate` when specifying measures with the required parameters. Example `Parameters` object for `$evaluate`:
```json
{
  "resourceType" : "Parameters",
  "parameter" : [
  {
    "name" : "measureId",
    "valueString" : "BreastCancerScreeningsFHIR"
  },
  {
    "name" : "measureId",
    "valueString" : "CervicalCancerScreeningFHIR"
  },
  {
    "name" : "periodEnd",
    "valueString" : "2022-12-31"
  },
  {
    "name" : "periodStart",
    "valueString" : "2022-01-01"
  },
  {
    "name" : "reportType",
    "valueString" : "population"
  }
  ]
}
```


This operation will execute in a multi-process manner by chunking up the patients to smaller groups and executing across 5 processes if there are more than 100 calculations to execute. The settings for this multi-process "Scaled" calculation can be configured in the `.env` file:

| ENV Variable              | Description                                                                 | Default Value |
| ------------------------- | --------------------------------------------------------------------------- | ------------- |
| `EXEC_WORKERS`            | Number of worker processes. 0 will disable multi-process calculation.       | 5             |
| `SCALED_EXEC_THRESHOLD`   | Calculation count threshold to execute in worker processes.                     | 100           |
| `SCALED_EXEC_MAX_JOBSIZE` | Maximum patients to put in each worker job.                                 | 15            |
| `SCALED_EXEC_STRATEGY`    | Patient source strategy to use for scaled calculation (`mongo` or `bundle`) | bundle        |

This operation returns a Parameters object with 0..* Bundles, each of which must contain at least one MeasureReport. Each bundle contains MeasureReports associated with exactly one measure. Check out the [$evaluate operation spec](https://build.fhir.org/ig/HL7/davinci-deqm/OperationDefinition-evaluate.html) for more information.

#### `$care-gaps`

This operation calculates gaps in care for a given patient against the given measure.

Required parameters include:

- `periodStart`: start of the measurement period
- `periodEnd`: end of the measurement period
- `status`: status of the care gap

The user also SHALL include either

- `subject`: subject for which the measure will be calculated
  OR
- `organization`: Reference to an organization for which the gaps in care report will be created
  OR
- `organization` and `practitioner`: Reference to a generalPractitioner for which the gaps in care report should be created

The user MAY include

- `measureId` OR `measureIdentifier` OR `measureURL`: a measure identification field for which the gaps in care will be reported
  OR
- `program`: programs that a provider participates in, for which only associated measures will be used to report gaps in care

Otherwise all available measures will be used.

Currently, `topic` and using both a measure identification and 'program' at the same time is not yet supported by the test server.

To use, first POST a measure bundle into your database, then send a GET request to `http://localhost:3000/4_0_1/Measure/$care-gaps` with the required parameters.

Check out the [$care-gaps operation spec](https://build.fhir.org/ig/HL7/davinci-deqm/OperationDefinition-care-gaps.html) for more information.

#### `$data-requirements`

This operation retrieves all the data requirements for a given measure as a FHIR library.

Optional parameters for this function include:

- `periodStart`: start of the measurement period
- `periodEnd`: end of the measurement period

If either `periodStart` or `periodEnd` parameter is supplied without the other, a measurement period will be used with duration 1 year starting or ending at the provided date. If `periodStart` and `periodEnd` parameters are omitted entirely, the measurement period for the operation will default to the `effectivePeriod` of the referenced FHIR Measure. If no `effectivePeriod` property is present, `dateFilters` will be excluded from the returned FHIR Library entirely.

To use, first POST a measure bundle into your database, then send a GET request to `http://localhost:3000/4_0_1/Measure/<your-measure-id>/$data-requirements`.

Check out the [$data-requirements operation spec](https://www.hl7.org/fhir/measure-operation-data-requirements.html) for more information.

#### `$submit-data`

This operation takes a Measure Report and a set of required data with which to calculate the measure, and the server adds new documents to the database for each contained FHIR object. To use, send a valid FHIR parameters object in a POST request to `http://localhost:3000/4_0_1/Measure/$submit-data` or `http://localhost:3000/4_0_1/Measure/<your-measure-id>/$submit-data`.

Check out the [$submit-data operation spec](https://www.hl7.org/fhir/measure-operation-submit-data.html) for more information.

#### `Patient/$everything`

This operation returns a searchset bundle containing all the information related to a patient. If no patient ID is specified, bundle will contain information for all patients.

To use, first POST a bundle into your database, then send a GET request to `http://localhost:3000/4_0_1/Patient/<your-patient-id>/$everything` or `http://localhost:3000/4_0_1/Patient/$everything`.

Check out the [Patient-everything operation spec](https://www.hl7.org/fhir/operation-patient-everything.html) for more information.

### Bulk Import

The server contains functionality for the bulk $import operation using some parts of the Import Manifest approach defined by the [smart-on-fhir's Bulk Data Import Proposal](https://github.com/smart-on-fhir/bulk-import/blob/master/import-manifest.md).

The first step in the bulk $import operation work flow is to gather data for submission and organize that data into a set of inputs that this server will retrieve. Inputs can be gathered using the [bulk-export-server](https://github.com/projecttacoma/bulk-export-server) $export operation.

To kickoff a bulk data import operation, POST a valid Import Manifest object to `http://localhost:3000/$import`. In contrast to the Bulk Data Import Proposal, this server accepts a FHIR Parameters resource Import Manifest as input for the $import operation. Example Import Manifest:

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "input",
      "part": [
        {
          "name": "url",
          "valueUrl": "http://localhost:3001/ccdc6013-4a14-4bc5-8348-8c4b17a437f7/Coverage.ndjson"
        },
        {
          "name": "inputDetails",
          "part": [
            {
              "name": "resourceType",
              "valueCode": "Coverage"
            }
          ]
        }
      ]
    },
    {
      "name": "input",
      "part": [
        {
          "name": "url",
          "valueUrl": "http://localhost:3001/ccdc6013-4a14-4bc5-8348-8c4b17a437f7/Condition.ndjson"
        },
        {
          "name": "inputDetails",
          "part": [
            {
              "name": "resourceType",
              "valueCode": "Condition"
            }
          ]
        }
      ]
    }
  ]
}
```

The user can check the status of an $import or $bulk-submit-data request by copying the content-location header in the response, and sending a GET request to `http://localhost:3000/<content-location-header>`.

## License

Copyright 2021-2022 The MITRE Corporation

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

```bash
http://www.apache.org/licenses/LICENSE-2.0
```

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

# Data Exchange for Quality Measures (DEQM) Test Server

Test server for executing FHIR-based Electronic Clinical Quality Measures (eCQMs).

- [Installation](#installation)

  - [Prerequisites](#prerequisites)
  - [Local Installation](#local-installation)
  - [Testing](#testing)
  - [MongoDB](#mongodb)

- [Usage](#usage)

  - [Database Setup](#database-setup)
  - [CRUD Operations](#crud-operations)
  - [Searches] (#searches)
  - [Supported FHIR Operations](#supported-fhir-operations)

- [License](#license)

## Installation

### Prerequisites

- [Node.js >=10.15.1](https://nodejs.org/en/)
- [MongoDB >= 5.0](https://www.mongodb.com)
- [Git](https://git-scm.com/)

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

## Usage

Once MongoDB is running on your machine, run the `npm start` command to start up the FHIR server at `localhost:3000`. The server can also be run in "watch" mode with `npm run start:watch`.

For ease of testing, it is recommended to download [Insomnia API Client and Design Tool](https://insomnia.rest) for sending HTTP requests to the server and [Robo 3T](https://robomongo.org) as a GUI for viewing the Mongo database.

### Database Setup

The following `npm` commands can be used to set up the database:

- `npm run db:setup` creates collections for all the valid FHIR resource types
- `npm run db:delete` deletes all existing collections in the database
- `npm run db:reset` runs both of the above, deleting all current collections and then creating new, empty collections

### CRUD Operations

The test server supports the standard CRUD operations to create, read, update, and delete documents in the database. See the [MongoDB CRUD Operations documentation](https://docs.mongodb.com/manual/crud/) for more information.

### Searches

The test server's Measure searching capabilities support searches by name, version, both, or neither.

- `GET http://localhost:3000/4_0_0/Measure/` returns all Measures currently in the database
- `GET http://localhost:3000/4_0_0/Measure?name=NAME` returns all Measures in the database with name `NAME`
- `GET http://localhost:3000/4_0_0/Measure?NAME&version=VERSION` returns all Measures in the database with name `NAME` and version `VERSION`

The test server's resource searching capabilities support searches by identifier.

- `GET http://localhost:3000/4_0_0/RESOURCETYPE/?identifier=ID` returns bundle entries of resource type `RESOURCETYPE` that have the identifier `ID`. Errors are thrown when an identifier is not included. An empty searchset is returned if the identifier cannot be found in the database.

### Supported FHIR Operations

#### `$evaluate-measure`

This operation calculates a measure for a given patient. Currently, individual measure reports are supported. Subject-list and population measure reports are not yet supported.

Required parameters include:

- `periodStart`: start of the measurement period
- `periodEnd`: end of the measurement period
- `subject`: subject for which the measure will be calculated

Currently, `measure`, `practitioner`, and `lastReceivedOn` parameters are not supported by the test server.

To use, first POST a measure bundle into your database, then send a GET request to `http://localhost:3000/4_0_0/Measure/<your-measure-id>/$evaluate-measure` with the required parameters.

#### `$care-gaps`

This operation calculates gaps in care for a given patient against the given measure.

Required parameters include:

- `periodStart`: start of the measurement period
- `periodEnd`: end of the measurement period
- `subject`: subject for which the measure will be calculated
- `status`: status of the care gap

Currently, `topic`, `practitioner`, `organization`, and `program` are not supported by the test server.

To use, first POST a measure bundle into your database, then send a GET request to `http://localhost:3000/4_0_0/Measure/$care-gaps` with the required parameters.

#### `$data-requirements`

This operation retrieves all the data requirements for a given measure as a FHIR library. To use, first POST a measure bundle into your database, then send a GET request to `http://localhost:3000/4_0_0/Measure/<your-measure-id>/$data-requirements`.

#### `$submit-data`

This operation takes a Measure Report and a set of required data with which to calculate the measure, and the server adds new documents to the database for each contained FHIR object. To use, send a valid FHIR parameters object in a POST request to `http://localhost:3000/4_0_0/Measure/$submit-data`.

## License

Copyright 2021 The MITRE Corporation

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

```bash
http://www.apache.org/licenses/LICENSE-2.0
```

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

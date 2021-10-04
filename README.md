# Data Exchange for Quality Measures (DEQM) Test Server

Test server for executing FHIR-based Electronic Clinical Quality Measures (eCQMs).

- [Local Development](#local-development)

  - [Prerequisites](#prerequisites)
  - [Local Installation](#local-installation)
  - [Testing](#testing)
  - [MongoDB](#mongodb)

- [Usage](#usage)

  - [CRUD Operations](#crud-operations)
  - [Supported Operations](#supported-operations)

- [License](#license)

## Installation and Local Development

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

Tests can be running using the following `npm` command:

```bash
npm run test
```

### MongoDB

This test server makes use of [MongoDB](https://www.mongodb.com), a cross-platform document-oriented database program.

Follow the [MongoDB Community Edition installation guide](https://docs.mongodb.com/manual/installation/) for your platform, and follow the commands for running MongoDB on your machine.

## Usage

Once MongoDB is running, run the `npm start` command to start up the FHIR server at `localhost:3000`. The server can also be run in "watch" mode with `npm run start:watch`.

For ease of testing, it is recommended to download [Insomnia API Client and Design Tool](https://insomnia.rest) for sending HTTP requests to the server and [Robo 3T](https://robomongo.org) as a GUI for the Mongo database.

**_ add info about npm start and other npm commands to run _**

**_ add info about sending HTTP requests and viewing database _**

### CRUD Operations

#### Searching

The test server's Measure searching capabilities support searches by name, version, both, or neither.

- `GET http://localhost:3000/4_0_0/Measure/` returns all Measures currently in the database
- `GET http://localhost:3000/4_0_0/Measure?name=NAME` returns all Measures in the database with name `NAME`
- `GET http://localhost:3000/4_0_0/Measure?NAME&version=VERSION` returns all Measures in the database with name `NAME` and version `VERSION`

The test server's resource searching capabilities support searches by identifier.

- `GET http://localhost:3000/4_0_0/RESOURCETYPE/?identifier=ID` returns bundle entries of resource type `RESOURCETYPE` that have the identifier `ID`. Errors are thrown when an identifier is not included. An empty searchset is returned if the identifier cannot be found in the database.

### Supported Operations

#### `$evaluate-measure

This operation calculates a measure for a given patient. Currently, individual measure reports are supported and subject-list and population measure reports are not yet supported.

Required parameters include:

- `periodStart`: start of the measurement period
- `periodEnd`: end of the measurement period
- `subject`: subject for which the measure will be calculated

Optional parameters include:

- Currently, `measure`, `practitioner`, and `lastReceivedOn` parameters are unsupported by the test server.

#### $care-gaps

This operation calculates gaps in care for a given patient against the given measure.

#### $data-requirements

## License

Copyright 2021 The MITRE Corporation

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

```bash
http://www.apache.org/licenses/LICENSE-2.0
```

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

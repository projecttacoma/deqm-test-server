const axios = require('axios');
const { Server } = require('@projecttacoma/node-fhir-server-core');
const configBulkImport = require('../controllers/import.controller');
const configTransaction = require('../controllers/bundle.controller');
const configBulkStatus = require('../controllers/bulkstatus.controller');
const configClientFile = require('../controllers/clientfile.controller');
const { BadRequestError } = require('../util/errorUtils');

class DEQMServer extends Server {
  enableTransactionRoute() {
    this.app.post('/:base_version/', configTransaction.transaction);
    // return self for chaining
    return this;
  }
  enableBulkStatusRoute() {
    this.app.get('/:base_version/bulkstatus/:client_id', configBulkStatus.bulkstatus);
    return this;
  }
  enableImportRoute() {
    this.app.post('/:base_version/([$])import/', configBulkImport.bulkImport);
    return this;
  }
  enableClientFileRoute() {
    this.app.get('/:base_version/file/:clientId/:fileName', configClientFile.clientFile);
    return this;
  }
  async enableValidationMiddleWare() {
    await axios.put('http://localhost:4567/igs/hl7.fhir.us.qicore');
    // how to make this async logic work correctly? Does it work correctly?
    this.app.put('*', validateFhir);
    this.app.post('*', validateFhir);
    return this;
  }
}

async function initialize(config, app) {
  let server = new DEQMServer(config, app);

  if (process.env.VALIDATE) {
    server = await server.enableValidationMiddleWare();
  }
  server = server
    .configureMiddleware()
    .configureSession()
    .configureHelmet()
    .configurePassport()
    .setPublicDirectory()
    .enableTransactionRoute()
    .enableBulkStatusRoute()
    .enableImportRoute()
    .enableClientFileRoute()
    .setProfileRoutes()
    .setErrorRoutes();

  return server;
}

async function validateFhir(req, res, next) {
  const profiles = retrieveProfiles(req.originalUrl);
  if (profiles !== 'Calculation') {
    //We know the profile pulled from the URL will be the last profile added to the array
    const qicoreProfile = `http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-${profiles[
      profiles.length - 1
    ].toLowerCase()}`;
    const qicoreValidationUrl = `http://${process.env.VALIDATOR_HOST}:${process.env.VALIDATOR_PORT}/validate?profile=${qicoreProfile}`;

    const qicoreValidationInfo = await getValidationInfo(res, qicoreValidationUrl, req.body);
    const validationUrl = `http://${process.env.VALIDATOR_HOST}:${
      process.env.VALIDATOR_PORT
    }/validate?profile=${profiles.join(',')}`;
    const validationInfo = await getValidationInfo(res, validationUrl, req.body);
    if (validationInfo.isValid) {
      if (qicoreValidationInfo.isValid) {
        profiles.push(qicoreProfile);
      }
      if (req.body?.meta?.profile) {
        const validatedProfiles = new Set(req.body.meta.profile);
        profiles.forEach(profile => {
          validatedProfiles.add(profile);
        });
        req.body.meta.profile = Array.from(validatedProfiles);
      } else {
        req.body['meta'] = { profile: profiles };
      }

      next();
    } else {
      res.status(400).json(validationInfo.data);
    }
  } else {
    next();
  }
}

function retrieveProfiles(originalUrl, body) {
  const profiles = [];
  const params = originalUrl.split('/');

  const metaProfiles = body?.meta?.profile;
  if (metaProfiles) {
    profiles.push(...metaProfiles);
  }
  if (params[params.length - 1] === '$submit-data') {
    profiles.push('Parameters');
  }
  // We don't need to validate posted Parameters bodies for dollar-sign operations since these aren't stored in the db
  else if (params[params.length - 1][0] === '$') {
    return 'Calculation';
  }
  // Only param was base_version, so this is a transaction bundle upload
  else if (params.length === 2) {
    profiles.push('Bundle');
  } else if (params.length > 2) {
    /*
     * If two or more params and not dollar-sign operation, third param must be the resourceType
     * keep in mind, the first param will always be the empty string since originalUrl starts with '/'
     */
    profiles.push(params[2]);
  } else {
    throw new BadRequestError('Unable to retrieve expected profile type for validation');
  }
  return profiles;
}

async function getValidationInfo(res, validationUrl, body) {
  const response = await axios.post(validationUrl, body);
  if (response.data.issue[0].severity !== 'information') {
    return { isValid: false, data: response.data };
  }
  return { isValid: true };
}

module.exports = { DEQMServer, initialize };

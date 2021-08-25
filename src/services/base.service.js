const { findResourceById, createResource, removeResource, updateResource } = require('../util/mongo.controller');
const { v4: uuidv4 } = require('uuid');
const { resolveSchema, ServerError } = require('@asymmetrik/node-fhir-server-core');

/**
 * creates an object and generates an id for it regardless of the id passed in
 * @param {*} req an object containing the request body
 * @param {*} resourceType string which dsignifies which collection to add the data to
 * @returns the id of the created object
 */
const baseCreate = async ({ req }, resourceType) => {
  //Create a new id regardless of whether one is passed
  const data = req.body;
  data['id'] = uuidv4();
  data['_id'] = data.id;
  return createResource(data, resourceType);
};

/**
 * Searches for the object of the requested type with the requested id
 * @param {*} args the args added to the end of the url, contains id of desired resource
 * @param {*} resourceType string which signifies which collection to search for
 * the data and which FHIR type to cast the result to
 * @returns the object with the desired id cast to the requested type
 */
const baseSearchById = async (args, resourceType) => {
  const dataType = resolveSchema(args.base_version, resourceType.toLowerCase());
  const result = await findResourceById(args.id, resourceType);
  if (!result) {
    return {};
  }
  return new dataType(result);
};

/**
 * updates the document of the specified resource type with the passed in id or creates a new
 * document if no document with passed id is found
 * @param {*} args the args added to the end of the url, contains id of desired resource
 * @param {*} req the
 * @param {*} resourceType string which dsignifies which collection to add the data to
 * @returns the id of the updated/created document
 */
const baseUpdate = async (args, { req }, resourceType) => {
  const body = req.body;

  //The user passes in an id in the request body and it doesn't match the id arg in the url
  //or user doesn't pass in body
  if (body.id !== args.id) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: 'Argument id must match request body id for PUT request'
          }
        }
      ]
    });
  }
  body['_id'] = body.id;
  return updateResource(args.id, req.body, resourceType);
};

/**
 * removes the document of the specified type with the specified id from the collection
 * @param {*} args the args added to the end of the url, contains id of desired resource
 * @param {*} resourceType string which signifies which collection to add the data to
 * @returns an object containing deletedCount: the number of documents deleted
 */
const baseRemove = async (args, resourceType) => {
  return removeResource(args.id, resourceType);
};
module.exports = { baseCreate, baseSearchById, baseUpdate, baseRemove };

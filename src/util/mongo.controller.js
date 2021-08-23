const { db } = require('./mongo');
const { ServerError } = require('@asymmetrik/node-fhir-server-core');

const findResourceById = async (id, resourceType) => {
  const collection = db.collection(resourceType);
  return await collection.findOne({ id: id.toString() });
};

const createResource = async (data, resourceType) => {
  const collection = db.collection(resourceType);
  const results = await collection.insertOne(data);
  return { id: results._id };
};

const removeResource = async (id, resourceType) => {
  const collection = db.collection(resourceType);
  try {
    const res = await collection.deleteOne({ id: id.toString() });
    return res;
  } catch (err) {
    throw new ServerError(err.message, {
      statusCode: 409,
      issues: [
        {
          severity: 'error',
          code: 'internal',
          details: {
            text: err.message
          }
        }
      ]
    });
  }
};

const updateResource = async (id, data, resourceType) => {
  const collection = db.collection(resourceType);
  const results = collection.findOneAndUpdate({ id: id.toString() }, { $set: data }, { upsert: true });
  return {
    id: results._id
  };
};

module.exports = { findResourceById, createResource, removeResource, updateResource };

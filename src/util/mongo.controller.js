const { db } = require('./mongo');
const { ServerError } = require('@asymmetrik/node-fhir-server-core');

const findResourceById = async (id, resourceType) => {
  const collection = db.collection(resourceType);
  const result = await collection.findOne({ id: id.toString() });
  return result;
};

const createResource = async (data, resourceType) => {
  const collection = db.collection(resourceType);
  const results = await collection.insertOne(data);
  return { id: results.insertedId };
};

const removeResource = async (id, resourceType) => {
  const collection = db.collection(resourceType);
  const res = await collection.deleteOne({ id: id.toString() });
  return res;
};

const updateResource = async (id, data, resourceType) => {
  const collection = db.collection(resourceType);
  const results = await collection.findOneAndUpdate({ id: id.toString() }, { $set: data }, { upsert: true });
  return {
    id: results.value.id
  };
};

module.exports = { findResourceById, createResource, removeResource, updateResource };

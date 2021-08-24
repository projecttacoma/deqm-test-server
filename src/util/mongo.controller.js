const { db } = require('./mongo');

const findResourceById = async (id, resourceType) => {
  const collection = db.collection(resourceType);
  return await collection.findOne({ id: id });
};

const createResource = async (data, resourceType) => {
  const collection = db.collection(resourceType);
  const results = await collection.insertOne(data);
  return { id: results.insertedId };
};

const removeResource = async (id, resourceType) => {
  const collection = db.collection(resourceType);
  return await collection.deleteOne({ id: id });
};

const updateResource = async (id, data, resourceType) => {
  const collection = db.collection(resourceType);
  const results = await collection.findOneAndUpdate({ id: id }, { $set: data }, { upsert: true });
  return {
    id: results.value.id
  };
};

module.exports = { findResourceById, createResource, removeResource, updateResource };

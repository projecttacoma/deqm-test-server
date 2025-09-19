//@ts-nocheck 
const { MongoClient } = require('mongodb');
require('../config/envConfig');

// Connection URL
const url = `mongodb://${process.env.DB_HOST}:${process.env.DB_PORT}`;
const client = new MongoClient(url);

module.exports = { client, db: client.db(process.env.DB_NAME) };

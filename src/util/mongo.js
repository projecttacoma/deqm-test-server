/* eslint-disable no-undef */
const { MongoClient } = require('mongodb');
require('./dbconfig');

// Connection URL
const url = `mongodb://${process.env.DB_HOST}:${process.env.DB_PORT}`;
const client = new MongoClient(url);

module.exports = { client, db: client.db(process.env.DB_NAME) };

/* eslint-disable no-undef */
const { MongoClient } = require('mongodb');
/*eslint-disable-next-line no-unused-vars*/
const dbconfig = require('./dbconfig');

// Connection URL
const url = `mongodb://${process.env.DB_HOST}:${process.env.DB_PORT}`;
const client = new MongoClient(url);

module.exports = { client, db: client.db(process.env.DB_NAME) };

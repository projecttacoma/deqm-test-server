import { MongoClient } from 'mongodb';
import '../config/envConfig';

// Connection URL
const url = `mongodb://${process.env.DB_HOST}:${process.env.DB_PORT}`;
export const client = new MongoClient(url);
export const db = client.db(process.env.DB_NAME);

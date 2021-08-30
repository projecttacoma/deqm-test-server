const mongoUtil = require('../util/mongo');

async function main() {
  // Use connect method to connect to the server
  await mongoUtil.client.connect();
  console.log('Connected successfully to server');
  const collections = await mongoUtil.db.listCollections().toArray();

  db.collection("libraries").insertMany(libraries, function(err, res) {
    if (err) throw err;
    console.log(res.insertedCount+" documents inserted");
    // close the connection to db when you are done with it
    db.close();
});


}
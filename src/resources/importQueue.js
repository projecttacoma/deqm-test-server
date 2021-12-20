const Queue = require('bee-queue');

//const { executePingAndPull } = require('../services/import.service');

// const queueOptions = {
//   removeOnSuccess: true
// };

// Create a new queue to establish new Redis connection
const importQueue = new Queue('import', {
  removeOnSuccess: true,
  isWorker: false
});

importQueue.on('error', err => {
  console.log('queue error: ', err);
});

module.exports = importQueue;

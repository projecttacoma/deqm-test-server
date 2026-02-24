import { createClient } from 'redis';

type ClientType = ReturnType<typeof createClient>;
let redisClient: ClientType;

export async function checkCancelled(jobId: string) {
  await createConnection();
  return (await redisClient.get(`job:${jobId}:canceled`)) === '1';
}

export async function setCancelled(jobId: string) {
  await createConnection();
  redisClient.set(`job:${jobId}:canceled`, '1');
}

async function createConnection() {
  if (!redisClient) {
    const client = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
    });
    await client.connect();
    redisClient = client;
  }
}

import fs from 'node:fs/promises';
import yaml from 'yaml';
import { z } from 'zod';
import logger from '../server/logger';
import path from 'node:path';

export const JwtAuthConfigSchema = z.object({
  type: z.literal('jwt'),
  url: z.string(),
  authUrl: z.string(),
  clientId: z.string()
});

export const SecretAuthConfigSchema = z.object({
  type: z.literal('secret'),
  url: z.string(),
  authUrl: z.string(),
  clientId: z.string(),
  clientSecret: z.string()
});

export const TokenAuthConfigSchema = z.object({
  type: z.literal('token'),
  url: z.string(),
  token: z.string()
});

export const ExtAuthConfigSchema = z.discriminatedUnion('type', [
  JwtAuthConfigSchema,
  SecretAuthConfigSchema,
  TokenAuthConfigSchema
]);

export const ConfigSchema = z.object({
  servers: z.array(ExtAuthConfigSchema)
});

export type ExtAuthConfig = z.infer<typeof ExtAuthConfigSchema>;

async function loadAuthConfig(): Promise<Array<ExtAuthConfig>> {
  if (!process.env.AUTH_CONFIG_FILE) {
    logger.warn('No AUTH_CONFIG_FILE environment variable specified.');
    return [];
  }
  const configPath = path.resolve(process.env.AUTH_CONFIG_FILE);
  try {
    const file = await fs.readFile(configPath, 'utf8');
    const config = ConfigSchema.parse(yaml.parse(file));
    return config.servers;
  } catch (e) {
    logger.warn(`Could not load external auth config from ${configPath}. `, e);
    return [];
  }
}

export async function getExtAuthConfig(url: string): Promise<ExtAuthConfig | undefined> {
  logger.info(`Finding auth config for "${url}`);
  const config = await loadAuthConfig();
  return config.find(config => config.url === url);
}

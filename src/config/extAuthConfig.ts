import fs from 'node:fs/promises';
import yaml from 'yaml';
import { z } from 'zod';
import logger from '../server/logger';
import path from 'node:path';

export const JwtAuthConfigSchema = z.object({
  type: z.literal('jwt'),
  url: z.string(),
  authUrl: z.string(),
  clientId: z.string(),
  customScopes: z.string().optional()
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

/**
 * Look up a server's external authentication configuration by FHIR base URL.
 * AUTH_CONFIG_FILE points to a YAML file containing a servers array.
 * @param {string} url the FHIR base URL
 * @returns {Promise<Object|undefined>} the matching configuration, if present
 */
export async function getExtAuthConfig(url: string): Promise<ExtAuthConfig | undefined> {
  logger.info(`Finding auth config for "${url}`);
  const config = await loadAuthConfig();
  return config.find(config => urlsMatch(config.url, url));
}

/**
 * Helper function to check if 2 URLs match.
 * Currently this only ignores trailing slashes but more can be added if useful.
 * @param {string} url1
 * @param {string} url2
 * @returns {boolean} true if URLs match, false otherwise
 */
function urlsMatch(url1: string, url2: string) {
  return url1.replace(/\/+$/, '') === url2.replace(/\/+$/, '');
}

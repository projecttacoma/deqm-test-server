import axios from 'axios';
import 'dotenv/config';
import jose from 'node-jose';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { v4 } from 'uuid';
import { getExtAuthConfig } from '../config/extAuthConfig';
import logger from '../server/logger';

const privateKeyFile = process.env.JWT_PRIVATE_KEY_FILE;

const SUPPORTED_ALGORITHMS = ['ES384', 'RS384'];

type TokenState = {
  bearerToken: string;
  expiresAtMs: number;
  tokenEndpoint: string;
  grantedScope?: string;
};

type TokenResponse = {
  access_token: string;
  expires_in: number;
};

// if a token expires in this many ms or sooner, don't use it, fetch a new one
const TOKEN_EXP_BUFFER_MS = 1000;

const TOKEN_MAP = new Map<string, TokenState>();
// A $collect-data invocation may issue multiple endpoint queries at once. Keep
// one in-flight authentication request per FHIR base URL so those queries share
// its result instead of each obtaining a token.
const TOKEN_REQUESTS = new Map<string, Promise<TokenState | null>>();

export default class TokenManager {
  static invalidate(fhirBaseUrl: string, rejectedBearerToken?: string) {
    const currentToken = TOKEN_MAP.get(fhirBaseUrl);
    if (rejectedBearerToken == null || currentToken?.bearerToken === rejectedBearerToken) {
      TOKEN_MAP.delete(fhirBaseUrl);
    }
  }

  static async getToken(fhirBaseUrl: string, force = false): Promise<TokenState | null> {
    const previousToken = TOKEN_MAP.get(fhirBaseUrl);
    if (previousToken != null && !force) {
      const expired = Date.now() + TOKEN_EXP_BUFFER_MS > previousToken.expiresAtMs;

      if (!expired) {
        return previousToken;
      }
      this.invalidate(fhirBaseUrl);
    }

    const pendingRequest = TOKEN_REQUESTS.get(fhirBaseUrl);
    if (pendingRequest) {
      return pendingRequest;
    }

    const tokenRequest = this.acquireToken(fhirBaseUrl);
    TOKEN_REQUESTS.set(fhirBaseUrl, tokenRequest);

    try {
      return await tokenRequest;
    } finally {
      TOKEN_REQUESTS.delete(fhirBaseUrl);
    }
  }

  private static async acquireToken(fhirBaseUrl: string): Promise<TokenState | null> {
    const authConfig = await getExtAuthConfig(fhirBaseUrl);
    const { clientId, authUrl: customEndpoint } = authConfig?.type === 'jwt' ? authConfig : {};
    const customScopes = null;

    // TODO, if unknown server return null
    if (clientId == null) {
      return null;
    }

    const tokenEndpoint = customEndpoint ?? (await getTokenEndpoint(fhirBaseUrl));

    logger.debug(`using tokenEndpoint ${tokenEndpoint}`);

    // generate the signed JWT first
    const jwt = await generateJWT(clientId, tokenEndpoint);

    logger.debug(`constructed JWT ${jwt}`);

    // get the bearer token
    const rawToken = await getAccessToken(tokenEndpoint, jwt.toString(), customScopes);

    logger.debug(rawToken);

    const tokenState = {
      bearerToken: formatBearerToken(rawToken.access_token),
      // expires_in is time until expiration in seconds, Date.now() is in milliseconds
      expiresAtMs: Date.now() + rawToken.expires_in * 1000,
      tokenEndpoint
    };

    TOKEN_MAP.set(fhirBaseUrl, tokenState);

    return tokenState;
  }
}

function formatBearerToken(accessToken: string): string {
  return /^Bearer\s/i.test(accessToken) ? accessToken : `Bearer ${accessToken}`;
}

/**
 * Get the token_endpoint from the .well-known/smart-configuration
 *
 * @param {string} url - the fhir base url
 * @returns token_endpoint
 */
async function getTokenEndpoint(url: string) {
  // Attempt checking at the `.well-known/smart-configuration`
  const response = await axios.get(`${url}/.well-known/smart-configuration`);
  return response.data.token_endpoint;
}

async function getAccessToken(url: string, jwt: string, customScopes: string | null): Promise<TokenResponse> {
  const props = {
    scope: customScopes ?? 'system/*.rs',
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: jwt
  };

  const headers = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };

  const response = await axios.post<TokenResponse>(url, new URLSearchParams(props), headers);
  if (typeof response.data.access_token !== 'string' || !response.data.access_token) {
    throw new Error(`Token endpoint ${url} did not return an access_token.`);
  }
  if (typeof response.data.expires_in !== 'number' || response.data.expires_in <= 0) {
    throw new Error(`Token endpoint ${url} did not return a valid expires_in value.`);
  }

  return response.data;
}

/**
 * Generate a signed JWT used for authenticating
 */
async function generateJWT(client_id: string, aud: string) {
  const key = await getPrivateKey();

  const payload = {
    sub: client_id,
    iss: client_id,
    aud: aud,
    exp: Math.floor(Date.now() / 1000) + 240,
    jti: v4()
  };

  return jose.JWS.createSign(
    {
      format: 'compact',
      fields: { alg: key.alg, kid: key.kid }
    },
    key
  )
    .update(JSON.stringify(payload))
    .final();
}

async function getPrivateKey() {
  // I set JWT_PRIVATE_KEY_FILE to the path to the private-key.pem in the .env file
  if (!privateKeyFile) {
    throw new Error('JWT_PRIVATE_KEY_FILE is not configured');
  } else if (!existsSync(privateKeyFile)) {
    throw new Error('JWT_PRIVATE_KEY_FILE is configured but file does not exist');
  }

  const keyFileText = await fs.readFile(privateKeyFile, 'utf8');

  if (keyFileText.trimStart().startsWith('{')) {
    // it's a JWK
    const keys = JSON.parse(keyFileText);
    const keyAsJson = keys.keys.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (k: any) => SUPPORTED_ALGORITHMS.includes(k['alg']) && k['key_ops'].includes('sign')
    );
    return await jose.JWK.asKey(keyAsJson);
  }

  if (keyFileText.trimStart().startsWith('-')) {
    // it's a PEM
    return await jose.JWK.asKey(keyFileText, 'pem');
  }

  throw new Error('Unsupported file format for JWT_PRIVATE_KEY_FILE');
}

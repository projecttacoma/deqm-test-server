import axios from 'axios';
import 'dotenv/config';
import jose from 'node-jose';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { v4 } from 'uuid';

const privateKeyFile = process.env.JWT_PRIVATE_KEY_FILE;

const SUPPORTED_ALGORITHMS = ['ES384', 'RS384'];

type TokenState = {
  bearerToken: string;
  expiresAtMs: number;
  tokenEndpoint: string;
  grantedScope?: string;
};

// if a token expires in this many ms or sooner, don't use it, fetch a new one
const TOKEN_EXP_BUFFER_MS = 1000;

const TOKEN_MAP = new Map<string, TokenState>();

export default class TokenManager {
  static invalidate(fhirBaseUrl: string) {
    TOKEN_MAP.delete(fhirBaseUrl);
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

    console.log(`using fhirBaseUrl ${fhirBaseUrl}`);

    // TODO, get our client ID, etc, from config
    const { clientId, customScopes, customEndpoint } = deleteme();

    // TODO, if unknown server return null
    if (clientId == null) {
      return null;
    }

    const tokenEndpoint = customEndpoint ?? (await getTokenEndpoint(fhirBaseUrl));

    console.log(`using tokenEndpoint ${tokenEndpoint}`);

    // generate the signed JWT first
    const jwt = await generateJWT(clientId, tokenEndpoint);

    console.log(`constructed JWT ${jwt}`);

    // get the bearer token
    const rawToken = await getAccessToken(tokenEndpoint, jwt.toString(), customScopes);

    console.log(rawToken);

    const tokenState = {
      bearerToken: rawToken.access_token,
      // expires_in is time until expiration in seconds, Date.now() is in milliseconds
      expiresAtMs: Date.now() + rawToken.expires_in * 1000,
      tokenEndpoint
    };

    TOKEN_MAP.set(fhirBaseUrl, tokenState);

    return tokenState;
  }
}

function deleteme() {
  return {
    clientId:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InJlZ2lzdHJhdGlvbi10b2tlbiJ9.eyJqd2tzX3VybCI6Imh0dHA6Ly8xMC4xNS4yNTIuNzMvaW5mZXJuby8ud2VsbC1rbm93bi9qd2tzLmpzb24iLCJhY2Nlc3NUb2tlbnNFeHBpcmVJbiI6MTUsImlhdCI6MTU5NzQxMzE5NX0.q4v4Msc74kN506KTZ0q_minyapJw0gwlT6M_uiL73S4',
    customScopes: null,
    customEndpoint: null
  };
}

/**
 * Get the token_endpoint from the .well-known/smart-configuration
 *
 * @param {string} url - the fhir base url
 * @returns token_endpoint
 */
async function getTokenEndpoint(url: string) {
  try {
    const response = await axios.get(`${url}/.well-known/smart-configuration`);
    return response.data.token_endpoint;
  } catch (ex) {
    try {
      // sometimes the smart-config is in a non-standard place,
      // so let's try the server capability statement
      const response = await axios.get(`${url}/metadata`);

      const rest = response.data.rest;
      const serverRest = rest.find((r: object) => r.mode === 'server');
      const extensions = serverRest.security.extension;
      const oauth = extensions.find(
        (e: object) => e.url === 'http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris'
      );
      return oauth.extension.find((e: object) => e.url === 'token').valueUri;
    } catch {
      // not sure what to do if both fail?
      // for now throw the first error since that's where things are supposed to be
      throw ex;
    }
  }
}

async function getAccessToken(url: string, jwt: string, customScopes: string | null) {
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

  const response = await axios
    .post(url, new URLSearchParams(props), headers)
    .then(response => response.data)
    .catch(err => `Error obtaining access token from ${url}\n${err.message}`);

  return response;
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
      (k: object) => SUPPORTED_ALGORITHMS.includes(k['alg']) && k['key_ops'].includes('sign')
    );
    return await jose.JWK.asKey(keyAsJson);
  }

  if (keyFileText.trimStart().startsWith('-')) {
    // it's a PEM
    return await jose.JWK.asKey(keyFileText, 'pem');
  }

  throw new Error('Unsupported file format for JWT_PRIVATE_KEY_FILE');
}

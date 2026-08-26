import axios from 'axios';
import 'dotenv/config';
import jose from 'node-jose';
import * as fs from 'node:fs/promises';
import { v4 } from 'uuid';
const client_id = process.env.CLIENT_ID;
const privateKeyFile = process.env.JWT_PRIVATE_KEY_FILE;
const tokenEndpointUrl = process.env.TOKEN_ENDPOINT_URL;

/**
 * Generate and return access token for the specified server.
 */
async function connectToServer() {
  if (!client_id) {
    throw new Error('CLIENT_ID is not configured');
  }
  if (!tokenEndpointUrl) {
    throw new Error('TOKEN_ENDPOINT_URL is not configured');
  }
  const jwt = await generateJWT(client_id, tokenEndpointUrl);
  console.log(jwt);
}

export async function getAccessToken(url: string, jwt: any) {
  const props = {
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: jwt
  };

  const headers = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json+fhir'
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
export async function generateJWT(client_id: string, aud: string) {
  const options = { alg: 'RS384', typ: 'JWT', kid: 'deqm-test-server' };
  // I set JWT_PRIVATE_KEY_FILE to the path to the private-key.pem in the .env file
  if (!privateKeyFile) {
    throw new Error('JWT_PRIVATE_KEY_FILE is not configured');
  }

  const pem = await fs.readFile(privateKeyFile, 'utf8');
  const key = await jose.JWK.asKey(pem, 'pem');

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
      fields: options
    },
    key
  )
    .update(JSON.stringify(payload))
    .final();
}

connectToServer();

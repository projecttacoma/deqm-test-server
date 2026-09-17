import { getExtAuthConfig } from '../../src/config/extAuthConfig';
import path from 'node:path';

describe('extAuthConfig', () => {
  const authConfigFile = process.env.AUTH_CONFIG_FILE;

  afterEach(() => {
    if (authConfigFile === undefined) {
      delete process.env.AUTH_CONFIG_FILE;
    } else {
      process.env.AUTH_CONFIG_FILE = authConfigFile;
    }
  });

  describe('getExtAuthConfig', () => {
    it('should load return undefined if not found', async () => {
      expect(await getExtAuthConfig('http://unknown.example.com/fhir')).toBeUndefined();
    });

    it('should return undefined when AUTH_CONFIG_FILE is not specified', async () => {
      delete process.env.AUTH_CONFIG_FILE;

      expect(await getExtAuthConfig('http://jwt.example.com/fhir')).toBeUndefined();
    });

    it('should load jwt based config', async () => {
      expect(await getExtAuthConfig('http://jwt.example.com/fhir')).toEqual({
        url: 'http://jwt.example.com/fhir',
        authUrl: 'http://auth.example.com/token',
        type: 'jwt',
        clientId: 'jwt-client-id-101'
      });
    });

    it('should load client based config', async () => {
      expect(await getExtAuthConfig('http://secret.example.com/fhir')).toEqual({
        url: 'http://secret.example.com/fhir',
        authUrl: 'http://auth.example.com/token',
        type: 'secret',
        clientId: 'secret-client-id-102',
        clientSecret: 'asdfasasfasd'
      });
    });

    it('should load bearer token based config', async () => {
      expect(await getExtAuthConfig('http://bearer.example.com/fhir')).toEqual({
        url: 'http://bearer.example.com/fhir',
        type: 'token',
        token: 'asdasdas12312312312312'
      });
    });

    it('should return undefined when the config does not match the schema', async () => {
      process.env.AUTH_CONFIG_FILE = path.resolve(__dirname, 'fixtures/invalid-auth-config.yaml');

      expect(await getExtAuthConfig('http://jwt.example.com/fhir')).toBeUndefined();
    });

    it('should return undefined when the config is malformed YAML', async () => {
      process.env.AUTH_CONFIG_FILE = path.resolve(__dirname, 'fixtures/malformed-auth-config.yaml');

      expect(await getExtAuthConfig('http://jwt.example.com/fhir')).toBeUndefined();
    });
  });
});

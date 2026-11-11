import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import TokenManager from './tokenManager';
import logger from '../server/logger';

// SMART-aware client for outgoing FHIR interactions
export default class FHIRClient {
  private readonly http: AxiosInstance;

  constructor(private readonly baseUrl: string) {
    this.http = axios.create({
      baseURL: baseUrl.replace(/\/+$/, ''),
      headers: {
        Accept: 'application/fhir+json'
      }
    });
  }

  async get<T>(path: string, config: AxiosRequestConfig = {}): Promise<T> {
    const response = await this.getResponse<T>(path, config);
    return response.data;
  }

  async post<T>(path: string, body: unknown, config: AxiosRequestConfig = {}): Promise<T> {
    const response = await this.postResponse<T>(path, body, config);
    return response.data;
  }

  async getResponse<T>(path: string, config: AxiosRequestConfig = {}): Promise<AxiosResponse<T>> {
    return this.requestResponse<T>({
      ...config,
      method: 'GET',
      url: path
    });
  }

  async postResponse<T>(path: string, body: unknown, config: AxiosRequestConfig = {}): Promise<AxiosResponse<T>> {
    return this.requestResponse<T>({
      ...config,
      method: 'POST',
      url: path,
      data: body,
      headers: {
        'Content-Type': 'application/fhir+json',
        ...config.headers
      }
    });
  }

  private async requestResponse<T>(config: AxiosRequestConfig, retried = false): Promise<AxiosResponse<T>> {
    const token = await TokenManager.getToken(this.baseUrl);

    try {
      const headers = { ...config.headers };

      if (token) {
        headers['Authorization'] = token.bearerToken;
      }

      logger.debug(`External FHIR Request: ${config.method} ${config.url}`);

      const response = await this.http.request<T>({
        ...config,
        headers
      });

      return response;
    } catch (error) {
      if (!retried && axios.isAxiosError(error) && error.response?.status === 401) {
        TokenManager.invalidate(this.baseUrl, token?.bearerToken);
        return this.requestResponse<T>(config, true);
      }

      logger.error('Error with External FHIR Request', error);

      if (axios.isAxiosError(error)) {
        throw new Error(
          `Error with External FHIR Request to ${config.method} ${config.url}: ${error}\n${JSON.stringify(error.response?.data)}`,
          { cause: error }
        );
      }

      throw new Error(`Error with External FHIR Request to ${config.method} ${config.url}: ${error}`, { cause: error });
    }
  }
}

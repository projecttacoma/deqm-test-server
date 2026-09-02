import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import TokenManager from './tokenManager';

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
    return this.request<T>({ ...config, method: 'GET', url: path });
  }

  async post<T>(path: string, body: unknown, config: AxiosRequestConfig = {}): Promise<T> {
    return this.request<T>({
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

  private async request<T>(config: AxiosRequestConfig, retried = false): Promise<T> {
    const token = await TokenManager.getToken(this.baseUrl);

    try {
      const headers = { ...config.headers };
      if (token) {
        headers['Authorization'] = token.bearerToken;
        // console.log(`making request using bearer token ${token.bearerToken}`);
      } else {
        console.log('making request without bearer token');
      }

      const response = await this.http.request<T>({
        ...config,
        headers
      });

      return response.data;
    } catch (error) {
      if (!retried && axios.isAxiosError(error) && error.response?.status === 401) {
        // try again once if we got an error 401, maybe the token just expired
        TokenManager.invalidate(this.baseUrl, token?.bearerToken);
        return this.request<T>(config, true);
      }
      throw error;
    }
  }
}

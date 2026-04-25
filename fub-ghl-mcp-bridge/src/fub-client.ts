import { FUBPerson, FUBDeal, FUBSearchParams } from "./types";
import { Logger } from "./logger";

export class FUBClient {
  private baseUrl = "https://api.followupboss.com/v1";
  private apiKey: string;
  private xSystem: string;
  private xSystemKey: string;
  private requestTimeout: number;
  private logger: Logger;

  constructor(
    apiKey: string,
    xSystem: string,
    xSystemKey: string,
    requestTimeout: number = 15000
  ) {
    this.apiKey = apiKey;
    this.xSystem = xSystem;
    this.xSystemKey = xSystemKey;
    this.requestTimeout = requestTimeout;
    this.logger = new Logger("info");
  }

  private getAuthHeader(): string {
    // HTTPS Basic Auth with apiKey as username and blank password
    return "Basic " + btoa(`${this.apiKey}:`);
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: this.getAuthHeader(),
      "X-System": this.xSystem,
      "X-System-Key": this.xSystemKey,
      "Content-Type": "application/json",
    };
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async searchPeople(params: FUBSearchParams): Promise<FUBPerson[]> {
    const searchUrl = new URL(`${this.baseUrl}/people/search`);

    if (params.email) {
      searchUrl.searchParams.append("email", params.email);
    }
    if (params.phone) {
      searchUrl.searchParams.append("phone", params.phone);
    }
    if (params.name) {
      searchUrl.searchParams.append("name", params.name);
    }

    try {
      const response = await this.fetchWithTimeout(searchUrl.toString(), {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        this.logger.error("FUB search failed", {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error(
          `FUB search failed with status ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as { people?: FUBPerson[] };
      return data.people || [];
    } catch (error) {
      this.logger.error("FUB search error", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getPerson(personId: string): Promise<FUBPerson | null> {
    const url = `${this.baseUrl}/people/${personId}`;

    try {
      const response = await this.fetchWithTimeout(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (response.status === 404) {
        this.logger.warn("FUB person not found", { personId });
        return null;
      }

      if (!response.ok) {
        this.logger.error("FUB get person failed", {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error(
          `FUB get person failed with status ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as { person?: FUBPerson };
      return data.person || null;
    } catch (error) {
      this.logger.error("FUB get person error", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getDeal(dealId: string): Promise<FUBDeal | null> {
    const url = `${this.baseUrl}/deals/${dealId}`;

    try {
      const response = await this.fetchWithTimeout(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (response.status === 404) {
        this.logger.warn("FUB deal not found", { dealId });
        return null;
      }

      if (!response.ok) {
        this.logger.error("FUB get deal failed", {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error(
          `FUB get deal failed with status ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as { deal?: FUBDeal };
      return data.deal || null;
    } catch (error) {
      this.logger.error("FUB get deal error", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getPersonDeals(personId: string): Promise<FUBDeal[]> {
    const url = `${this.baseUrl}/people/${personId}/deals`;

    try {
      const response = await this.fetchWithTimeout(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (response.status === 404) {
        this.logger.warn("FUB person deals not found", { personId });
        return [];
      }

      if (!response.ok) {
        this.logger.error("FUB get person deals failed", {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error(
          `FUB get person deals failed with status ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as { deals?: FUBDeal[] };
      return data.deals || [];
    } catch (error) {
      this.logger.error("FUB get person deals error", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

import { GHLContact, GHLOpportunity } from "./types";
import { Logger } from "./logger";

export class GHLClient {
  private baseUrl = "https://rest.gohighlevel.com/v1";
  private bearerToken: string;
  private locationId: string;
  private requestTimeout: number;
  private logger: Logger;

  constructor(
    bearerToken: string,
    locationId: string,
    requestTimeout: number = 15000
  ) {
    this.bearerToken = bearerToken;
    this.locationId = locationId;
    this.requestTimeout = requestTimeout;
    this.logger = new Logger("info");
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.bearerToken}`,
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

  async searchContacts(
    email?: string,
    phone?: string
  ): Promise<GHLContact[]> {
    const searchUrl = new URL(`${this.baseUrl}/contacts/search`);
    searchUrl.searchParams.append("locationId", this.locationId);

    if (email) {
      searchUrl.searchParams.append("email", email);
    }
    if (phone) {
      searchUrl.searchParams.append("phone", phone);
    }

    try {
      const response = await this.fetchWithTimeout(searchUrl.toString(), {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        this.logger.error("GHL search contacts failed", {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error(
          `GHL search contacts failed with status ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as { contacts?: GHLContact[] };
      return data.contacts || [];
    } catch (error) {
      this.logger.error("GHL search contacts error", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getContact(contactId: string): Promise<GHLContact | null> {
    const url = `${this.baseUrl}/contacts/${contactId}`;

    try {
      const response = await this.fetchWithTimeout(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (response.status === 404) {
        this.logger.warn("GHL contact not found", { contactId });
        return null;
      }

      if (!response.ok) {
        this.logger.error("GHL get contact failed", {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error(
          `GHL get contact failed with status ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as { contact?: GHLContact };
      return data.contact || null;
    } catch (error) {
      this.logger.error("GHL get contact error", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async createContact(contact: GHLContact): Promise<GHLContact> {
    const url = `${this.baseUrl}/contacts`;
    const payload = {
      ...contact,
      locationId: this.locationId,
    };

    try {
      const response = await this.fetchWithTimeout(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger.error("GHL create contact failed", {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error(
          `GHL create contact failed with status ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as { contact?: GHLContact };
      return data.contact || contact;
    } catch (error) {
      this.logger.error("GHL create contact error", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async updateContact(
    contactId: string,
    contact: Partial<GHLContact>
  ): Promise<GHLContact> {
    const url = `${this.baseUrl}/contacts/${contactId}`;
    const payload = {
      ...contact,
      locationId: this.locationId,
    };

    try {
      const response = await this.fetchWithTimeout(url, {
        method: "PUT",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger.error("GHL update contact failed", {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error(
          `GHL update contact failed with status ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as { contact?: GHLContact };
      return data.contact || (contact as GHLContact);
    } catch (error) {
      this.logger.error("GHL update contact error", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async addNote(contactId: string, note: string): Promise<void> {
    const url = `${this.baseUrl}/contacts/${contactId}/notes`;
    const payload = {
      value: note,
    };

    try {
      const response = await this.fetchWithTimeout(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger.warn("GHL add note failed", {
          status: response.status,
          statusText: response.statusText,
        });
      }
    } catch (error) {
      this.logger.warn("GHL add note error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async createOpportunity(
    opportunity: GHLOpportunity
  ): Promise<GHLOpportunity> {
    const url = `${this.baseUrl}/opportunities`;
    const payload = {
      ...opportunity,
      locationId: this.locationId,
    };

    try {
      const response = await this.fetchWithTimeout(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger.error("GHL create opportunity failed", {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error(
          `GHL create opportunity failed with status ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as {
        opportunity?: GHLOpportunity;
      };
      return data.opportunity || opportunity;
    } catch (error) {
      this.logger.error("GHL create opportunity error", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async updateOpportunity(
    opportunityId: string,
    opportunity: Partial<GHLOpportunity>
  ): Promise<GHLOpportunity> {
    const url = `${this.baseUrl}/opportunities/${opportunityId}`;
    const payload = {
      ...opportunity,
      locationId: this.locationId,
    };

    try {
      const response = await this.fetchWithTimeout(url, {
        method: "PUT",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger.error("GHL update opportunity failed", {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error(
          `GHL update opportunity failed with status ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as {
        opportunity?: GHLOpportunity;
      };
      return data.opportunity || (opportunity as GHLOpportunity);
    } catch (error) {
      this.logger.error("GHL update opportunity error", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getContactOpportunities(
    contactId: string
  ): Promise<GHLOpportunity[]> {
    const searchUrl = new URL(`${this.baseUrl}/opportunities/search`);
    searchUrl.searchParams.append("contactId", contactId);
    searchUrl.searchParams.append("locationId", this.locationId);

    try {
      const response = await this.fetchWithTimeout(searchUrl.toString(), {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        this.logger.error("GHL get contact opportunities failed", {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error(
          `GHL get contact opportunities failed with status ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as {
        opportunities?: GHLOpportunity[];
      };
      return data.opportunities || [];
    } catch (error) {
      this.logger.error("GHL get contact opportunities error", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

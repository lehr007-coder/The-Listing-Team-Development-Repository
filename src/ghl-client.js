const axios = require("axios");

const GHL_API_BASE = "https://services.leadconnectorhq.com";

class GHLClient {
  constructor({ apiKey, locationId }) {
    this.apiKey = apiKey;
    this.locationId = locationId;
    this.http = axios.create({
      baseURL: GHL_API_BASE,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
    });
  }

  /**
   * Search for a contact by email or phone
   */
  async findContact(email, phone) {
    const query = email || phone;
    if (!query) return null;

    const { data } = await this.http.get("/contacts/", {
      params: {
        locationId: this.locationId,
        query,
      },
    });

    return data.contacts?.[0] || null;
  }

  /**
   * Create a new contact in GHL
   */
  async createContact(contactData) {
    const { data } = await this.http.post("/contacts/", {
      ...contactData,
      locationId: this.locationId,
    });
    return data.contact;
  }

  /**
   * Update an existing contact's standard fields
   */
  async updateContact(contactId, contactData) {
    const { data } = await this.http.put(`/contacts/${contactId}`, contactData);
    return data.contact;
  }

  /**
   * Update custom field values on a contact
   */
  async updateCustomFields(contactId, customFields) {
    const { data } = await this.http.put(`/contacts/${contactId}`, {
      customFields,
    });
    return data.contact;
  }

  /**
   * Get all custom fields for the location
   */
  async getCustomFields() {
    const { data } = await this.http.get("/locations/" + this.locationId + "/customFields");
    return data.customFields || [];
  }

  /**
   * Combined: update both standard and custom fields in one call
   */
  async updateContactFull(contactId, { standardFields, customFields }) {
    const payload = { ...standardFields };
    if (customFields && customFields.length > 0) {
      payload.customFields = customFields;
    }
    const { data } = await this.http.put(`/contacts/${contactId}`, payload);
    return data.contact;
  }
}

module.exports = GHLClient;

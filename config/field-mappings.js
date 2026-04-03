/**
 * GHL Custom Field → Contact Object Field Mappings
 *
 * Maps Ylopo webhook data stored in GHL custom fields
 * to the correct standard contact/object fields.
 *
 * Format:
 *   customFieldKey: the custom field key in GHL (from webhook data)
 *   objectField:    the standard GHL contact field to populate
 *   type:           data type for validation/conversion
 */

const FIELD_MAPPINGS = [
  // Contact Info
  { customFieldKey: "ylopo_first_name",   objectField: "firstName",    type: "string" },
  { customFieldKey: "ylopo_last_name",    objectField: "lastName",     type: "string" },
  { customFieldKey: "ylopo_email",        objectField: "email",        type: "string" },
  { customFieldKey: "ylopo_phone",        objectField: "phone",        type: "string" },

  // Ylopo Identifiers
  { customFieldKey: "ylopo_uuid",         objectField: "customField",  type: "string" },
  { customFieldKey: "ylopo_lead_id",      objectField: "customField",  type: "string" },

  // Property Search Criteria
  { customFieldKey: "ylopo_beds",         objectField: "customField",  type: "number" },
  { customFieldKey: "ylopo_baths",        objectField: "customField",  type: "number" },
  { customFieldKey: "ylopo_sqft",         objectField: "customField",  type: "number" },
  { customFieldKey: "ylopo_price_min",    objectField: "customField",  type: "number" },
  { customFieldKey: "ylopo_price_max",    objectField: "customField",  type: "number" },
  { customFieldKey: "ylopo_price",        objectField: "customField",  type: "number" },

  // Property Details
  { customFieldKey: "ylopo_property_address", objectField: "address1",  type: "string" },
  { customFieldKey: "ylopo_property_city",    objectField: "city",      type: "string" },
  { customFieldKey: "ylopo_property_state",   objectField: "state",     type: "string" },
  { customFieldKey: "ylopo_property_zip",     objectField: "postalCode", type: "string" },

  // Lead Source
  { customFieldKey: "ylopo_source",       objectField: "source",       type: "string" },
  { customFieldKey: "ylopo_lead_type",    objectField: "customField",  type: "string" },
];

/**
 * Webhook field name → GHL custom field key
 *
 * Maps the raw field names from the Ylopo webhook payload
 * to the GHL custom field keys used above.
 */
const WEBHOOK_TO_CUSTOM_FIELD = {
  // Contact
  "first_name":       "ylopo_first_name",
  "firstName":        "ylopo_first_name",
  "last_name":        "ylopo_last_name",
  "lastName":         "ylopo_last_name",
  "email":            "ylopo_email",
  "phone":            "ylopo_phone",
  "phoneNumber":      "ylopo_phone",

  // Identifiers
  "uuid":             "ylopo_uuid",
  "id":               "ylopo_lead_id",
  "leadId":           "ylopo_lead_id",
  "lead_id":          "ylopo_lead_id",

  // Property Search
  "beds":             "ylopo_beds",
  "bedrooms":         "ylopo_beds",
  "baths":            "ylopo_baths",
  "bathrooms":        "ylopo_baths",
  "sqft":             "ylopo_sqft",
  "square_feet":      "ylopo_sqft",
  "squareFeet":       "ylopo_sqft",
  "price":            "ylopo_price",
  "priceMin":         "ylopo_price_min",
  "price_min":        "ylopo_price_min",
  "priceMax":         "ylopo_price_max",
  "price_max":        "ylopo_price_max",

  // Property Address
  "address":          "ylopo_property_address",
  "property_address": "ylopo_property_address",
  "city":             "ylopo_property_city",
  "state":            "ylopo_property_state",
  "zip":              "ylopo_property_zip",
  "zipCode":          "ylopo_property_zip",
  "postal_code":      "ylopo_property_zip",

  // Source
  "source":           "ylopo_source",
  "lead_type":        "ylopo_lead_type",
  "leadType":         "ylopo_lead_type",
};

module.exports = { FIELD_MAPPINGS, WEBHOOK_TO_CUSTOM_FIELD };

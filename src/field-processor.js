const { FIELD_MAPPINGS, WEBHOOK_TO_CUSTOM_FIELD } = require("../config/field-mappings");

/**
 * Processes incoming webhook data and separates it into:
 * - standardFields: GHL contact object fields (firstName, email, etc.)
 * - customFields:   GHL custom field values (beds, baths, sqft, etc.)
 */
function processWebhookData(webhookPayload) {
  const standardFields = {};
  const customFields = [];
  const unmapped = {};

  for (const [rawKey, rawValue] of Object.entries(webhookPayload)) {
    const customFieldKey = WEBHOOK_TO_CUSTOM_FIELD[rawKey];

    if (!customFieldKey) {
      unmapped[rawKey] = rawValue;
      continue;
    }

    const mapping = FIELD_MAPPINGS.find((m) => m.customFieldKey === customFieldKey);

    if (!mapping) {
      unmapped[rawKey] = rawValue;
      continue;
    }

    const value = coerceValue(rawValue, mapping.type);

    if (mapping.objectField === "customField") {
      // This field stays as a custom field — use the GHL custom field key
      customFields.push({
        key: customFieldKey,
        value: value,
      });
    } else {
      // This field maps to a standard GHL contact object field
      standardFields[mapping.objectField] = value;
    }
  }

  return { standardFields, customFields, unmapped };
}

/**
 * Takes existing custom field data already stored on a GHL contact
 * and populates the standard object fields based on the mapping config.
 *
 * This is the core "custom fields → object fields" workflow.
 */
function populateObjectFieldsFromCustomFields(existingCustomFields) {
  const standardFields = {};

  for (const mapping of FIELD_MAPPINGS) {
    if (mapping.objectField === "customField") continue;

    const customFieldEntry = existingCustomFields.find(
      (cf) => cf.key === mapping.customFieldKey || cf.id === mapping.customFieldKey
    );

    if (customFieldEntry && customFieldEntry.value != null && customFieldEntry.value !== "") {
      standardFields[mapping.objectField] = coerceValue(customFieldEntry.value, mapping.type);
    }
  }

  return standardFields;
}

/**
 * Coerce a value to the expected type
 */
function coerceValue(value, type) {
  if (value == null) return value;

  switch (type) {
    case "number":
      const num = Number(value);
      return isNaN(num) ? value : num;
    case "string":
      return String(value);
    default:
      return value;
  }
}

module.exports = { processWebhookData, populateObjectFieldsFromCustomFields };

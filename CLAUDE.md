# The Listing Team - Development Repository

## Project Overview
GHL (GoHighLevel) integration for The Listing Team, a real estate operation using Ylopo for lead generation.

## Architecture
- **Proxy Server**: Node.js/Express server that receives Ylopo webhooks and forwards data to GHL via API
- **Field Processor**: Maps webhook data → GHL custom fields → GHL standard contact object fields
- **GHL Client**: API client for GoHighLevel (LeadConnector API)

## Key Workflow
Ylopo sends lead data via webhook → Proxy server receives it → Data is stored in GHL custom fields → Workflow populates standard GHL contact/object fields from those custom fields (without changing anything else).

## Data Fields (from Ylopo webhooks)
- **Contact Info**: first_name, last_name, email, phone
- **Identifiers**: uuid, lead_id (Ylopo-specific)
- **Property Search Criteria**: beds, baths, sqft/square_feet, price, price_min, price_max
- **Property Address**: address, city, state, zip
- **Lead Source**: source, lead_type

## Field Mapping Logic
- Some webhook fields map to **standard GHL contact fields** (firstName, lastName, email, phone, address1, city, state, postalCode, source)
- Other fields stay as **GHL custom fields** (beds, baths, sqft, price, uuid, lead_id, lead_type)
- Mappings are defined in `config/field-mappings.js`

## Key Files
- `src/server.js` - Express proxy server (in progress)
- `src/ghl-client.js` - GHL API client
- `src/field-processor.js` - Webhook data processing and field mapping logic
- `config/field-mappings.js` - Field mapping configuration (webhook → custom field → object field)
- `package.json` - Node.js project config (express, axios, dotenv)

## Branch
- Development branch: `claude/ghl-custom-fields-workflow-8R5KG`

## Important Notes
- The workflow must ONLY populate object fields from custom field data — do not modify or overwrite other existing contact data
- Ylopo webhook field names can come in multiple formats (camelCase and snake_case) — both are handled in the mapping

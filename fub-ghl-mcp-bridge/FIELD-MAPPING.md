# FUB-GHL Field Mapping & Integration Guide

## Field Mapping Reference

### Person/Contact Field Mapping

| Follow Up Boss | GoHighLevel | Mapping Type | Notes |
|---|---|---|---|
| `person.firstName` | `contact.firstName` | Direct | Extracted from name if not present in FUB |
| `person.lastName` | `contact.lastName` | Direct | Extracted from name if not present in FUB |
| `person.email` | `contact.email` | Direct | Used for duplicate detection |
| `person.phone` | `contact.phone` | Direct | Used for duplicate detection |
| `person.id` | `customFields.fubPersonId` | Custom Field | Stored for future reference/updates |
| `person.stage` | `tags` | Derived | Converted to tag: `fub-{stage}` |
| `person.source` | `tags` | Derived | Converted to tag: `fub-{source}` |
| `person.tags[]` | `tags` | Derived | Each tag prefixed with `fub-` |
| `person.notes` | `customFields.fubNotes` | Custom Field | Full text stored |
| `person.assignedTo` | `customFields.fubAssignedAgent` | Custom Field | Agent email/ID stored |
| `person.createdAt` | `customFields.fubCreatedAt` | Custom Field | ISO timestamp |
| `person.updatedAt` | `customFields.fubUpdatedAt` | Custom Field | ISO timestamp |
| N/A | `contact.source` | Static | Always set to "Follow Up Boss" |
| N/A | `contact.locationId` | Environment | Automatically added from GHL_LOCATION_ID |

#### Example: FUB Person → GHL Contact

**FUB Person:**
```json
{
  "id": "abc123def456",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+1-555-123-4567",
  "stage": "lead",
  "source": "website",
  "tags": ["hot", "premium"],
  "notes": "Very interested in service",
  "assignedTo": "agent@example.com",
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-11-30T15:45:00Z"
}
```

**GHL Contact (Created/Updated):**
```json
{
  "id": "ghl_contact_xyz789",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+1-555-123-4567",
  "source": "Follow Up Boss",
  "locationId": "ghl_location_123",
  "tags": [
    "fub-sync",
    "fub-imported",
    "fub-lead",
    "fub-website",
    "fub-hot",
    "fub-premium"
  ],
  "customFields": {
    "fubPersonId": "abc123def456",
    "fubNotes": "Very interested in service",
    "fubAssignedAgent": "agent@example.com",
    "fubCreatedAt": "2024-01-15T10:00:00Z",
    "fubUpdatedAt": "2024-11-30T15:45:00Z",
    "fubStage": "lead",
    "fubSource": "website"
  }
}
```

**Note Added to Contact:**
```
Synced from Follow Up Boss via MCP bridge.
```

---

### Deal/Opportunity Field Mapping

| Follow Up Boss | GoHighLevel | Mapping Type | Notes |
|---|---|---|---|
| `deal.id` | `customFields.fubDealId` | Custom Field | Stored for duplicate prevention |
| `deal.name` | `opportunity.name` | Direct | Becomes opportunity name |
| `deal.value` | `opportunity.value` | Direct | Deal value in cents |
| `deal.status` | `customFields.fubDealStatus` | Custom Field | Original FUB status |
| `deal.stage` | `customFields.fubDealStage` | Custom Field | Original FUB stage |
| `person.id` | `opportunity.contactId` | Referenced | Links opportunity to contact |
| N/A | `opportunity.locationId` | Environment | Automatically added from GHL_LOCATION_ID |
| N/A | `customFields.syncedFromFUB` | Static | Always set to `true` |

#### Example: FUB Deal → GHL Opportunity

**FUB Deal + Person:**
```json
{
  "deal": {
    "id": "deal_123456",
    "name": "Annual Service Contract",
    "value": 120000,
    "status": "open",
    "stage": "proposal"
  },
  "person": {
    "id": "abc123def456",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

**GHL Opportunity (Created):**
```json
{
  "id": "ghl_opp_abc789",
  "contactId": "ghl_contact_xyz789",
  "locationId": "ghl_location_123",
  "name": "Annual Service Contract",
  "value": 120000,
  "customFields": {
    "fubDealId": "deal_123456",
    "fubDealStatus": "open",
    "fubDealStage": "proposal",
    "syncedFromFUB": true
  }
}
```

---

## Tag Naming Convention

Automatically applied tags follow a consistent naming scheme for easy filtering:

### Automatic Tags

- **Base sync tags:**
  - `fub-sync`: Applied to all synced contacts
  - `fub-imported`: Applied to all synced contacts

- **Stage tags:**
  - `fub-{stage}`: One tag per unique stage (e.g., `fub-lead`, `fub-prospect`, `fub-customer`)

- **Source tags:**
  - `fub-{source}`: One tag per unique source (e.g., `fub-website`, `fub-referral`, `fub-cold-call`)

- **Person tags:**
  - `fub-{personTag}`: Each FUB person tag prefixed (e.g., `fub-hot-lead`, `fub-premium`)

### Example Tag Application

**FUB Person with:**
- Stage: `lead`
- Source: `website`
- Tags: `["hot", "premium"]`

**Applied GHL Tags:**
```
fub-sync         # Base tag
fub-imported     # Base tag
fub-lead         # Stage
fub-website      # Source
fub-hot          # Person tag
fub-premium      # Person tag
```

---

## Custom Fields Structure

All FUB data is stored in GHL `customFields` under a consistent namespace:

```javascript
customFields: {
  // Required identifiers
  fubPersonId: "abc123def456",
  fubDealId: "deal_123456",  // For opportunities only

  // Person data
  fubNotes: "...",
  fubStage: "lead",
  fubSource: "website",
  fubAssignedAgent: "agent@example.com",
  
  // Timestamps
  fubCreatedAt: "2024-01-15T10:00:00Z",
  fubUpdatedAt: "2024-11-30T15:45:00Z",
  
  // Deal data (opportunities only)
  fubDealStatus: "open",
  fubDealStage: "proposal",
  syncedFromFUB: true
}
```

---

## Duplicate Detection Strategy

### Contact Duplicate Detection

The system prevents duplicate contacts using the following priority:

1. **Email Match** (Primary): Check existing GHL contacts by email
2. **Phone Match** (Secondary): If no email match, check by phone
3. **No Match**: Create new contact

**Flow:**
```
Search by Email
  ↓
Found? → Update Existing
  ↓ No
Search by Phone
  ↓
Found? → Update Existing
  ↓ No
Create New Contact
```

### Opportunity Duplicate Detection

Prevents duplicate opportunities from the same deal:

1. Check for existing opportunities linked to contact
2. Filter for opportunity with matching `fubDealId`
3. Skip if found (avoid creating duplicate)
4. Otherwise create new opportunity

---

## Data Sync Behavior

### What Gets Synced

✅ **Always Synced:**
- Name (firstName, lastName)
- Email
- Phone
- Stage
- Source
- Tags
- Notes (stored in customFields)
- Assigned agent (stored in customFields)

### What Gets Updated

**Contact Updates (on re-sync):**
- Email (if provided)
- Phone (if provided)
- Tags (appended, not replaced)
- Custom fields (merged, not replaced)

**Opportunity Updates:**
- No updates on re-sync (deals are treated as immutable once created)
- Creates new opportunity if same contact has multiple deals

### What Doesn't Sync

❌ **Never Synced:**
- GHL-specific custom fields
- GHL-specific tags (non-FUB tags)
- GHL contact history
- GHL opportunity status changes (if modified in GHL)

---

## Integration Patterns

### Pattern 1: Real-time Sync on FUB Create

**Flow:** FUB person created → Webhook → MCP sync

```javascript
// FUB webhook handler
app.post('/webhooks/fub', async (req, res) => {
  const { event, data } = req.body;
  
  if (event === 'person.created') {
    try {
      const result = await callMCP('sync_fub_person_to_ghl', {
        personId: data.personId
      });
      
      // Log sync
      await logSync(data.personId, result.contactId, 'created');
      
      res.json({ success: true });
    } catch (error) {
      console.error('Sync failed:', error);
      res.status(500).json({ error: error.message });
    }
  }
});
```

### Pattern 2: Batch Sync (Scheduled)

**Flow:** Scheduled job → Find unsynced → Batch sync

```javascript
// Run every hour
cron.schedule('0 * * * *', async () => {
  // Get FUB persons created in past hour
  const unsyncedPersons = await fubApi.getPeople({
    createdAfter: new Date(Date.now() - 3600000)
  });
  
  // Sync each
  for (const person of unsyncedPersons) {
    try {
      const result = await callMCP('sync_fub_person_to_ghl', {
        personId: person.id
      });
      
      // Mark as synced
      await saveSync(person.id, result.contactId);
    } catch (error) {
      console.error(`Failed to sync ${person.id}:`, error);
    }
  }
});
```

### Pattern 3: Manual Search + Sync

**Flow:** Search FUB → User selects → Sync to GHL

```javascript
// Search dialog in UI
async function handleSearchAndSync(email) {
  // Step 1: Search FUB
  const searchResult = await callMCP('search_fub_person', { email });
  
  if (searchResult.count === 0) {
    showMessage('Person not found in Follow Up Boss');
    return;
  }
  
  // Step 2: Show results, let user select
  const selected = await showSelectionDialog(searchResult.persons);
  
  if (!selected) return;
  
  // Step 3: Sync selected person
  const syncResult = await callMCP('sync_fub_person_to_ghl', {
    personId: selected.id
  });
  
  showMessage(`Successfully synced to GHL contact ${syncResult.contactId}`);
}
```

### Pattern 4: Deal to Opportunity

**Flow:** FUB deal created → Create GHL opportunity

```javascript
// FUB deal webhook handler
app.post('/webhooks/fub', async (req, res) => {
  const { event, data } = req.body;
  
  if (event === 'deal.created') {
    try {
      const result = await callMCP('create_ghl_opportunity_from_fub_deal', {
        personId: data.personId,
        dealId: data.dealId
      });
      
      res.json({ success: true, opportunityId: result.opportunityId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
});
```

---

## Handling Special Cases

### Multiple Contact Records

If a person has multiple email addresses in FUB:

1. **First Sync**: Uses primary email → Creates GHL contact
2. **Second Email**: Different email → May create new GHL contact
3. **Resolution**: Check `fubPersonId` in customFields to merge

```javascript
// Find existing synced contact
const existingContact = await ghlApi.searchByCustomField({
  field: 'fubPersonId',
  value: fubPersonId
});

if (existingContact) {
  // Update instead of creating new
  await updateContact(existingContact.id, newData);
}
```

### Person Without Name

If FUB person has no firstName/lastName:

- **Default**: Uses "Unknown" for firstName, empty string for lastName
- **Recommendation**: Require name fields in FUB before syncing

```javascript
const firstName = fubPerson.firstName || 
                 fubPerson.name?.split(' ')[0] || 
                 'Unknown';
const lastName = fubPerson.lastName || 
                fubPerson.name?.split(' ').slice(1).join(' ') || 
                '';
```

### Deal Without Value

If FUB deal has no value:

- **Default**: Set to `0` in GHL opportunity
- **Display**: Shown as "No value" or "Unpriced"

### Conflicting Tags

If person has conflicting tags (e.g., both `hot` and `cold`):

- **Behavior**: Both tags applied (no filtering)
- **Recommendation**: Audit FUB tagging strategy

---

## Validation Rules

### Required Fields for Contact Sync

- `personId` (from FUB)
- `firstName` (from FUB or derived)
- `lastName` (from FUB or derived)
- At least one of: email or phone (for duplicate detection)

### Required Fields for Opportunity Creation

- `personId` (links to contact)
- Contact must already exist or be created first
- `dealId` (optional, but recommended for tracking)

### Field Length Limits

- firstName: 255 chars (GHL API limit)
- lastName: 255 chars (GHL API limit)
- Email: 254 chars (RFC 5321)
- Phone: 20 chars (E.164 format)
- Custom fields: 1000 chars each

---

## Troubleshooting Mapping Issues

### Contact Created but Tags Missing

**Check:**
1. Person has stage/source/tags set in FUB
2. No special characters in stage/source names
3. Review MCP logs for error details

**Fix:**
```javascript
// Manually apply missing tags
const result = await callMCP('create_or_update_ghl_contact', {
  firstName, lastName, email,
  tags: ['fub-sync', 'fub-lead', 'fub-website']
});
```

### Opportunity Created but Deal ID Not Stored

**Check:**
1. `dealId` parameter was provided
2. Response includes `customFields.fubDealId`

**Fix:**
```javascript
// Verify with follow-up search
const opp = await ghlApi.getOpportunity(opportunityId);
console.log(opp.customFields.fubDealId);
```

### Custom Field Values Truncated

**Check:**
1. FUB notes exceed 1000 characters
2. Custom field has length limit in GHL

**Fix:**
```javascript
// Truncate notes before syncing
const truncatedNotes = fubPerson.notes.substring(0, 1000);
```

### Duplicate Contacts Created

**Reason:** Email/phone format variation (e.g., "+1-555-1234" vs "+15551234")

**Fix:**
```javascript
// Normalize phone before syncing
const normalizedPhone = phone.replace(/\D/g, '');
```

---

## Reference: API Response Examples

### After sync_fub_person_to_ghl

```json
{
  "personId": "abc123def456",
  "contactId": "ghl_contact_xyz789",
  "synced": true,
  "created": true,
  "updated": false,
  "tagsApplied": [
    "fub-sync",
    "fub-imported",
    "fub-lead",
    "fub-website",
    "fub-hot"
  ]
}
```

### After create_ghl_opportunity_from_fub_deal

```json
{
  "opportunityId": "ghl_opp_abc789",
  "created": true,
  "updated": false
}
```

### Contact Structure in Search Results

```json
{
  "id": "ghl_contact_xyz789",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+1-555-123-4567",
  "source": "Follow Up Boss",
  "locationId": "ghl_location_123",
  "tags": [
    "fub-sync",
    "fub-imported",
    "fub-lead",
    "fub-website",
    "fub-hot"
  ],
  "customFields": {
    "fubPersonId": "abc123def456",
    "fubStage": "lead",
    "fubSource": "website",
    "fubNotes": "Very interested",
    "fubAssignedAgent": "agent@example.com",
    "fubCreatedAt": "2024-01-15T10:00:00Z",
    "fubUpdatedAt": "2024-11-30T15:45:00Z"
  }
}
```

---

For more information, see the main [README.md](README.md) and [EXAMPLES.md](EXAMPLES.md).

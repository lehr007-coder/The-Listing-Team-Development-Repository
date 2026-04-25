# FUB-GHL MCP Bridge - Example Calls

Replace `https://fub-ghl-mcp-bridge.example.com` with your actual deployment URL.

## Table of Contents

1. [cURL Examples](#curl-examples)
2. [JavaScript/Node.js Examples](#javascriptnodejs-examples)
3. [Python Examples](#python-examples)
4. [Integration Flows](#integration-flows)

---

## cURL Examples

### Health Check

```bash
curl -X POST https://fub-ghl-mcp-bridge.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "health_check",
    "params": {}
  }'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "status": "ok",
    "service": "fub-ghl-mcp-bridge",
    "timestamp": "2024-12-01T12:00:00.000Z",
    "version": "1.0.0"
  }
}
```

---

### Search FUB Person by Email

```bash
curl -X POST https://fub-ghl-mcp-bridge.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "search_fub_person",
    "params": {
      "email": "john.doe@example.com"
    }
  }'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "persons": [
      {
        "id": "abc123def456",
        "email": "john.doe@example.com",
        "phone": "+1-555-123-4567",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "stage": "lead",
        "source": "website",
        "tags": ["hot-lead", "premium"],
        "notes": "Very interested in service",
        "assignedTo": "agent@example.com",
        "createdAt": "2024-01-15T10:00:00Z",
        "updatedAt": "2024-11-30T15:45:00Z"
      }
    ],
    "count": 1
  }
}
```

---

### Search FUB Person by Phone

```bash
curl -X POST https://fub-ghl-mcp-bridge.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "search_fub_person",
    "params": {
      "phone": "555-123-4567"
    }
  }'
```

---

### Search FUB Person by Name

```bash
curl -X POST https://fub-ghl-mcp-bridge.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "search_fub_person",
    "params": {
      "name": "John Doe"
    }
  }'
```

---

### Get FUB Person Details

```bash
curl -X POST https://fub-ghl-mcp-bridge.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "get_fub_person",
    "params": {
      "personId": "abc123def456"
    }
  }'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "id": "abc123def456",
    "email": "john.doe@example.com",
    "phone": "+1-555-123-4567",
    "firstName": "John",
    "lastName": "Doe",
    "name": "John Doe",
    "stage": "lead",
    "source": "website",
    "tags": ["hot-lead", "premium"],
    "notes": "Very interested in service. Follow up on Monday.",
    "assignedTo": "agent@example.com",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-11-30T15:45:00Z"
  }
}
```

---

### Create GHL Contact

```bash
curl -X POST https://fub-ghl-mcp-bridge.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "create_or_update_ghl_contact",
    "params": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "phone": "+1-555-123-4567",
      "source": "Follow Up Boss",
      "tags": ["fub-sync", "lead", "hot"],
      "customFields": {
        "fubPersonId": "abc123def456",
        "lastFollowUp": "2024-11-30"
      }
    }
  }'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "contactId": "ghl_contact_xyz789",
    "created": true,
    "updated": false
  }
}
```

---

### Update Existing GHL Contact

```bash
curl -X POST https://fub-ghl-mcp-bridge.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 7,
    "method": "create_or_update_ghl_contact",
    "params": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "phone": "+1-555-123-4567",
      "tags": ["fub-sync", "lead", "hot", "qualified"]
    }
  }'
```

**Response (existing contact):**
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "contactId": "ghl_contact_xyz789",
    "created": false,
    "updated": true
  }
}
```

---

### Sync FUB Person to GHL

```bash
curl -X POST https://fub-ghl-mcp-bridge.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 8,
    "method": "sync_fub_person_to_ghl",
    "params": {
      "personId": "abc123def456"
    }
  }'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {
    "personId": "abc123def456",
    "contactId": "ghl_contact_xyz789",
    "synced": true,
    "created": false,
    "updated": true,
    "tagsApplied": [
      "fub-sync",
      "fub-imported",
      "fub-lead",
      "fub-website",
      "fub-hot-lead",
      "fub-premium"
    ]
  }
}
```

---

### Create GHL Opportunity from FUB Deal

```bash
curl -X POST https://fub-ghl-mcp-bridge.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 9,
    "method": "create_ghl_opportunity_from_fub_deal",
    "params": {
      "personId": "abc123def456",
      "dealId": "deal_123456"
    }
  }'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "result": {
    "opportunityId": "ghl_opp_abc789",
    "created": true,
    "updated": false
  }
}
```

---

### Error Example - Missing Required Parameter

```bash
curl -X POST https://fub-ghl-mcp-bridge.example.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 10,
    "method": "create_or_update_ghl_contact",
    "params": {
      "firstName": "John"
    }
  }'
```

**Response (error):**
```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "error": {
    "code": -32603,
    "message": "firstName and lastName are required",
    "data": {
      "requestId": "req_1701436800000_abc123"
    }
  }
}
```

---

## JavaScript/Node.js Examples

### Basic Helper Function

```javascript
const MCP_URL = 'https://fub-ghl-mcp-bridge.example.com';

async function callMCP(method, params) {
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Math.random(),
      method,
      params,
    }),
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`MCP Error: ${data.error.message}`);
  }
  
  return data.result;
}

// Usage
const result = await callMCP('health_check', {});
console.log(result);
```

---

### Search FUB Person

```javascript
async function searchFUBPerson(email) {
  const result = await callMCP('search_fub_person', {
    email: email,
  });

  if (result.count === 0) {
    console.log('No person found');
    return null;
  }

  return result.persons[0];
}

// Usage
const person = await searchFUBPerson('john@example.com');
console.log(person);
```

---

### Sync FUB to GHL Workflow

```javascript
async function syncFUBPersonToGHL(personId) {
  console.log(`Syncing FUB person ${personId}...`);

  // Step 1: Get FUB person details
  const fubPerson = await callMCP('get_fub_person', {
    personId: personId,
  });

  console.log(`Found: ${fubPerson.firstName} ${fubPerson.lastName}`);

  // Step 2: Sync to GHL
  const syncResult = await callMCP('sync_fub_person_to_ghl', {
    personId: personId,
  });

  console.log(`Synced to GHL contact: ${syncResult.contactId}`);
  console.log(`Tags applied: ${syncResult.tagsApplied.join(', ')}`);

  return syncResult;
}

// Usage
try {
  const result = await syncFUBPersonToGHL('abc123def456');
  console.log('Sync successful:', result);
} catch (error) {
  console.error('Sync failed:', error.message);
}
```

---

### Batch Sync Multiple Contacts

```javascript
async function batchSyncContacts(personIds) {
  console.log(`Syncing ${personIds.length} contacts...`);

  const results = [];
  const errors = [];

  for (const personId of personIds) {
    try {
      const result = await callMCP('sync_fub_person_to_ghl', {
        personId: personId,
      });
      results.push(result);
      console.log(`✓ Synced ${personId}`);
    } catch (error) {
      errors.push({ personId, error: error.message });
      console.error(`✗ Failed ${personId}: ${error.message}`);
    }

    // Add delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return { results, errors };
}

// Usage
const personIds = [
  'abc123def456',
  'def456ghi789',
  'ghi789jkl012',
];

const { results, errors } = await batchSyncContacts(personIds);
console.log(`Synced: ${results.length}, Errors: ${errors.length}`);
```

---

### Create Opportunity from Deal

```javascript
async function createOpportunityFromDeal(personId, dealId) {
  console.log(`Creating opportunity for person ${personId}, deal ${dealId}...`);

  const result = await callMCP('create_ghl_opportunity_from_fub_deal', {
    personId: personId,
    dealId: dealId,
  });

  console.log(`Created opportunity: ${result.opportunityId}`);
  return result;
}

// Usage
const opp = await createOpportunityFromDeal('abc123def456', 'deal_123456');
```

---

## Python Examples

### Basic Helper Function

```python
import requests
import json
from typing import Any, Dict

MCP_URL = "https://fub-ghl-mcp-bridge.example.com"

def call_mcp(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Call the FUB-GHL MCP bridge."""
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    }
    
    response = requests.post(
        MCP_URL,
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    
    data = response.json()
    
    if "error" in data:
        raise Exception(f"MCP Error: {data['error']['message']}")
    
    return data.get("result")

# Usage
result = call_mcp("health_check", {})
print(result)
```

---

### Search FUB Person

```python
def search_fub_person(email: str = None, phone: str = None, name: str = None):
    """Search for a FUB person."""
    params = {}
    
    if email:
        params["email"] = email
    if phone:
        params["phone"] = phone
    if name:
        params["name"] = name
    
    if not params:
        raise ValueError("At least one parameter required: email, phone, or name")
    
    result = call_mcp("search_fub_person", params)
    
    if result["count"] == 0:
        return None
    
    return result["persons"][0]

# Usage
person = search_fub_person(email="john@example.com")
if person:
    print(f"Found: {person['firstName']} {person['lastName']}")
else:
    print("Person not found")
```

---

### Sync Workflow

```python
def sync_fub_person_to_ghl(person_id: str):
    """Sync a FUB person to GHL."""
    print(f"Syncing FUB person {person_id}...")
    
    # Get person details
    person = call_mcp("get_fub_person", {"personId": person_id})
    print(f"Found: {person['firstName']} {person['lastName']}")
    
    # Sync to GHL
    sync_result = call_mcp("sync_fub_person_to_ghl", {"personId": person_id})
    
    print(f"Synced to GHL contact: {sync_result['contactId']}")
    print(f"Tags applied: {', '.join(sync_result['tagsApplied'])}")
    
    return sync_result

# Usage
try:
    result = sync_fub_person_to_ghl("abc123def456")
    print("Sync successful")
except Exception as e:
    print(f"Sync failed: {e}")
```

---

### Batch Sync with Retry

```python
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

def sync_contact_with_retry(person_id: str, max_retries: int = 3):
    """Sync contact with automatic retry."""
    for attempt in range(max_retries):
        try:
            result = call_mcp("sync_fub_person_to_ghl", {"personId": person_id})
            print(f"✓ Synced {person_id}")
            return result
        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt
                print(f"✗ Attempt {attempt + 1} failed, retrying in {wait_time}s...")
                time.sleep(wait_time)
            else:
                print(f"✗ Failed after {max_retries} attempts: {e}")
                raise

def batch_sync_contacts(person_ids: list, max_workers: int = 3):
    """Sync multiple contacts in parallel."""
    results = []
    errors = []
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(sync_contact_with_retry, pid): pid
            for pid in person_ids
        }
        
        for future in as_completed(futures):
            person_id = futures[future]
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                errors.append({"person_id": person_id, "error": str(e)})
    
    print(f"Synced: {len(results)}, Errors: {len(errors)}")
    return results, errors

# Usage
person_ids = ["abc123def456", "def456ghi789", "ghi789jkl012"]
results, errors = batch_sync_contacts(person_ids)
```

---

## Integration Flows

### Webhook-Triggered Sync

```javascript
// Express.js example
app.post('/webhook/fub-person-created', async (req, res) => {
  const { personId } = req.body;

  try {
    // Sync person to GHL
    const result = await callMCP('sync_fub_person_to_ghl', {
      personId: personId,
    });

    // Log sync result
    console.log(`Person ${personId} synced to GHL contact ${result.contactId}`);

    res.json({
      success: true,
      ghlContactId: result.contactId,
    });
  } catch (error) {
    console.error(`Sync failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
```

---

### Scheduled Batch Sync (Node.js + node-cron)

```javascript
import cron from 'node-cron';

// Run every hour
cron.schedule('0 * * * *', async () => {
  console.log('Starting scheduled sync...');

  try {
    // Get list of unsynced FUB persons from database
    const unsyncedPersons = await getUnsyncedPersons();

    console.log(`Found ${unsyncedPersons.length} unsynced persons`);

    for (const person of unsyncedPersons) {
      try {
        const result = await callMCP('sync_fub_person_to_ghl', {
          personId: person.id,
        });

        // Mark as synced in database
        await markAsSynced(person.id, result.contactId);

        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(
          `Failed to sync person ${person.id}: ${error.message}`
        );
      }
    }

    console.log('Scheduled sync completed');
  } catch (error) {
    console.error(`Scheduled sync failed: ${error.message}`);
  }
});
```

---

### Error Handling and Logging

```javascript
async function callMCPWithLogging(method, params) {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();

  try {
    console.log(`[${requestId}] Calling ${method}`, params);

    const result = await callMCP(method, params);

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Success (${duration}ms)`, result);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Error (${duration}ms): ${error.message}`);

    // Re-throw with request ID for tracking
    throw new Error(
      `[${requestId}] ${error.message}`
    );
  }
}
```

---

For more details, see the main [README.md](README.md).

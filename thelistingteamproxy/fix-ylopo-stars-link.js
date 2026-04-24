// =============================================================================
// FIX: Replace broken getYlopoLink() in PRIORITY_LEADS_HTML template
// =============================================================================
//
// Worker:   thelistingteamproxy (Cloudflare Worker)
// Template: PRIORITY_LEADS_HTML
//
// PROBLEM:
//   The getYlopoLink() function inside the PRIORITY_LEADS_HTML template is
//   outdated and broken. It fails to find Ylopo Stars links in many cases
//   because it:
//     - Only checks contact.customField (not contact.customFields)
//     - Does a naive string search for 'ylopo.com' or 'stars.ylopo' in field
//       values without checking field keys
//     - Does not look for ylopo_stars, fub_ylopo_stars, or stars_link field keys
//     - Does not search UUID values in ylopo-specific fields (ylopo_uuid,
//       ylopo_id, ylopo_contact_id, ylopo_lead_id)
//     - Falls back to a generic contacts page instead of searching by email
//
// SOLUTION:
//   Replace the old getYlopoLink() with the improved version from the
//   YLOPO_CONTACTS_HTML template (shown below). This version uses a multi-step
//   lookup strategy that handles all known field naming conventions and
//   provides a useful email-search fallback.
//
// WHERE TO APPLY:
//   In the thelistingteamproxy worker source code, locate the
//   PRIORITY_LEADS_HTML template string. Inside that template, find the
//   <script> block containing the function definition:
//
//       function getYlopoLink(contact) { ... }
//
//   Replace that entire function with the new version below.
//
// =============================================================================

// NEW getYlopoLink() — paste this in place of the old function inside
// PRIORITY_LEADS_HTML's <script> block.

function getYlopoLink(contact) {
    if (!contact) return '';
    var fields = Array.isArray(contact.customField) ? contact.customField : Array.isArray(contact.customFields) ? contact.customFields : [];
    // 1. Direct stars link fields
    for (var i=0; i<fields.length; i++) {
        var f = fields[i];
        var fk = String(f.fieldKey||f.key||f.name||'').toLowerCase().replace('contact.','');
        var val = String(f.value||'');
        if ((fk.indexOf('ylopo_stars')!==-1 || fk.indexOf('fub_ylopo_stars')!==-1) && val.indexOf('http')===0) return val;
    }
    // 2. Any field with stars.ylopo.com URL
    for (var i=0; i<fields.length; i++) {
        var val = String(fields[i].value||'');
        if (val.indexOf('stars.ylopo.com')!==-1 && val.indexOf('http')===0) return val;
    }
    // 3. Any stars_link field
    for (var i=0; i<fields.length; i++) {
        var fk = String(fields[i].fieldKey||fields[i].key||fields[i].name||'').toLowerCase().replace('contact.','');
        var val = String(fields[i].value||'');
        if (fk.indexOf('stars_link')!==-1) {
            if (val.indexOf('http')===0) return val;
        }
    }
    // 4. UUID in ylopo field -> construct URL
    for (var i=0; i<fields.length; i++) {
        var fk = String(fields[i].fieldKey||fields[i].key||fields[i].name||'').toLowerCase();
        var val = String(fields[i].value||'');
        if (fk.indexOf('ylopo')!==-1 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
            return 'https://stars.ylopo.com/lead-detail/' + val;
        }
    }
    // 5. UUID in ylopo-specific fields
    for (var i=0; i<fields.length; i++) {
        var fk = String(fields[i].fieldKey||fields[i].key||fields[i].name||'').toLowerCase().replace('contact.','');
        var val = String(fields[i].value||'');
        if ((fk.indexOf('ylopo_uuid')!==-1 || fk.indexOf('ylopo_id')!==-1 || fk.indexOf('ylopo_contact_id')!==-1 || fk.indexOf('ylopo_lead_id')!==-1) && /[0-9a-f]{8}-[0-9a-f]{4}/i.test(val)) {
            var m = val.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
            if (m) return 'https://stars.ylopo.com/lead-detail/' + m[0];
        }
    }
    // 6. Fallback: search by email
    if (contact.email) return 'https://stars.ylopo.com/contacts?search=' + encodeURIComponent(contact.email);
    return 'https://stars.ylopo.com/contacts';
}

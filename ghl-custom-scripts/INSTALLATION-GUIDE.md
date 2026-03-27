# Ylopo Object Refresh - GHL Installation Guide

## Problem
Ylopo custom object data in Go HighLevel displays stagnant/cached information and does not refresh when the page is loaded.

## Solution
A JavaScript snippet that forces Ylopo widget iframes and custom object sections to reload fresh data on every page load and SPA navigation event.

## Installation Steps

### Option 1: Add to GHL Global Custom Code (Recommended)
This applies the fix across your entire GHL account.

1. Log into your **Go HighLevel** account
2. Navigate to **Settings** > **Custom Code** (or **Settings** > **Custom Values/Code**)
3. In the **Header Code** or **Body Code** section, paste the following:

```html
<script>
  // Paste the entire contents of ylopo-object-refresh.js here
</script>
```

4. Click **Save**

### Option 2: Add to a Specific Page/Funnel
If you only need the fix on specific pages:

1. Open the **page or funnel editor** where Ylopo objects appear
2. Click **Settings** (gear icon) for the page
3. Go to the **Custom Code** tab
4. Paste the script in the **Header Code** or **Body Code** section
5. Click **Save**

### Option 3: Add as a Custom Widget
1. Go to the **Contact Record** page where Ylopo objects display
2. If you have access to **custom widgets**, create a new HTML widget
3. Paste the script inside `<script>` tags
4. Position the widget on the page (it can be hidden — it just needs to run)

## Verification

After installation:

1. Open your browser's **Developer Console** (F12 > Console tab)
2. Navigate to a contact record with Ylopo data
3. You should see log messages like:
   ```
   [Ylopo Refresh] Initializing Ylopo Object Refresh script...
   [Ylopo Refresh] Found 1 Ylopo iframe(s). Refreshing...
   [Ylopo Refresh] Initial refresh complete.
   ```
4. Every time you navigate to a contact or reload the page, the Ylopo data should pull fresh

## Disabling Debug Logs

Once you've verified it works, you can disable the console logs:

In the script, find this line:
```javascript
debug: true
```

Change it to:
```javascript
debug: false
```

## Troubleshooting

- **"No Ylopo iframes found"**: The script may need updated selectors for your specific Ylopo widget. Check the iframe's HTML attributes in Developer Tools and add them to the `iframeSelectors` array in the CONFIG section.
- **Data still stale**: Increase the `initialDelay` value (e.g., from `1500` to `3000`) to give GHL more time to render before the refresh triggers.
- **Breaks other widgets**: Narrow the selectors to only target your specific Ylopo iframe by its exact `src` URL or `id` attribute.

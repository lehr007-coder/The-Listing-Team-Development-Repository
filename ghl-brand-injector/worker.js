/**
 * GHL Brand Injector - Cloudflare Worker
 * Proxies app.gohighlevel.com and injects custom brand CSS/JS
 * Provides admin panel for managing brands at /__admin
 */

// Brand configuration storage
const BRANDS = {
  'reallistingteam': {
    name: 'The Listing Team',
    logoUrl: 'https://cdn.example.com/logo.png',
    colors: {
      gradLeft: '#1a1a2e',
      gradMid: '#16213e',
      gradRight: '#0f3460',
      gradUnderline: '#e94560',
      chipGreen: '#0f3460',
      surfaceBlue: '#E8F0FE',
      textStrong: '#1a1a2e',
      textMuted: '#424242',
    },
    customCSS: '',
  },
};

// Utility: Get all brands from KV
async function getAllBrands(env) {
  const keys = await env.BRANDS.list();
  const brands = {};
  for (const key of keys.keys) {
    if (key.name.startsWith('brand:')) {
      const brandKey = key.name.substring(6);
      brands[brandKey] = await env.BRANDS.get(key.name, 'json');
    }
  }
  return brands;
}

// Utility: Get single brand
async function getBrand(env, key) {
  return await env.BRANDS.get(`brand:${key}`, 'json');
}

// Utility: Set brand
async function setBrand(env, key, data) {
  await env.BRANDS.put(`brand:${key}`, JSON.stringify(data));
}

// Utility: Delete brand
async function deleteBrand(env, key) {
  await env.BRANDS.delete(`brand:${key}`);
}

// Utility: Get agency settings
async function getAgencySettings(env) {
  const defaults = {
    agencyName: 'The Listing Team',
    agencyLogo: '',
    contactEmail: '',
    contactPhone: '',
    defaultColors: {
      gradLeft: '#1a1a2e',
      gradMid: '#16213e',
      gradRight: '#0f3460',
      gradUnderline: '#e94560',
      chipGreen: '#0f3460',
      surfaceBlue: '#E8F0FE',
      textStrong: '#1a1a2e',
      textMuted: '#424242',
    },
    ghlAgencyKey: '',
  };
  const stored = await env.BRANDS.get('agency:settings', 'json');
  return stored ? { ...defaults, ...stored } : defaults;
}

// Utility: Set agency settings
async function setAgencySettings(env, settings) {
  await env.BRANDS.put('agency:settings', JSON.stringify(settings));
}

// Utility: Validate admin key
async function validateAdminKey(env, token) {
  // Check KV password override first
  const passwordOverride = await env.BRANDS.get('admin:password_override');
  if (passwordOverride) {
    return token === passwordOverride;
  }
  // Fall back to env secret
  return token === env.ADMIN_KEY;
}

// Utility: Set password override
async function setPasswordOverride(env, password) {
  await env.BRANDS.put('admin:password_override', password);
}

// Fetch location data for brand setup
async function fetchLocationData(ghlKey) {
  try {
    const response = await fetch('https://api.gohighlevel.com/v1/locations/', {
      headers: { Authorization: `Bearer ${ghlKey}` },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.locations || [];
  } catch (e) {
    return null;
  }
}

// Extract colors from GHL location
async function extractColorsFromLocation(ghlKey, locationId) {
  try {
    const response = await fetch(`https://api.gohighlevel.com/v1/locations/${locationId}`, {
      headers: { Authorization: `Bearer ${ghlKey}` },
    });
    if (!response.ok) return null;
    const location = await response.json();
    // Try to extract brand colors from location data
    if (location.locationData?.brand?.colors) {
      return location.locationData.brand.colors;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Sync brands from GHL
async function syncBrandsFromGHL(env, ghlKey) {
  const locations = await fetchLocationData(ghlKey);
  if (!locations) return { success: false, message: 'Failed to fetch locations' };

  const synced = [];
  for (const location of locations) {
    const colors = await extractColorsFromLocation(ghlKey, location.id);
    const brandKey = location.name.toLowerCase().replace(/\s+/g, '_');
    const brand = {
      name: location.name,
      locationId: location.id,
      colors: colors || {},
      customCSS: '',
      syncedAt: new Date().toISOString(),
    };
    await setBrand(env, brandKey, brand);
    synced.push(brandKey);
  }

  return { success: true, synced };
}

// Build brand CSS
function buildBrandCSS(brand, agencySettings) {
  const colors = brand.colors || agencySettings.defaultColors;
  return `
    :root {
      --grad-left: ${colors.gradLeft};
      --grad-mid: ${colors.gradMid};
      --grad-right: ${colors.gradRight};
      --grad-underline: ${colors.gradUnderline};
      --chip-green: ${colors.chipGreen};
      --surface-blue: ${colors.surfaceBlue};
      --text-strong: ${colors.textStrong};
      --text-muted: ${colors.textMuted};
    }
    ${brand.customCSS || ''}
  `;
}

// Build brand script for injection
async function buildBrandScript(env, brandKey) {
  const brand = await getBrand(env, brandKey);
  if (!brand) return null;

  const agencySettings = await getAgencySettings(env);
  const css = buildBrandCSS(brand, agencySettings);

  return `
    (function() {
      const style = document.createElement('style');
      style.textContent = \`${css}\`;
      document.head.appendChild(style);

      if ('${brand.logoUrl}') {
        const observer = new MutationObserver(() => {
          const logo = document.querySelector('[data-testid="app-logo"]') ||
                      document.querySelector('img[src*="logo"]');
          if (logo) {
            logo.src = '${brand.logoUrl}';
            observer.disconnect();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    })();
  `;
}

// HTML Rewriter to inject brand script
class BrandInjector {
  constructor(script) {
    this.script = script;
  }

  element(element) {
    element.append(`<script>${this.script}</script>`, { html: true });
  }
}

// Handle admin API requests
async function handleAdminAPI(env, request, path) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  // Validate auth
  const isValid = await validateAdminKey(env, token);
  if (!isValid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // GET /agency-settings
  if (request.method === 'GET' && path === '/__admin/api/agency-settings') {
    const settings = await getAgencySettings(env);
    return new Response(JSON.stringify(settings), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // PUT /agency-settings
  if (request.method === 'PUT' && path === '/__admin/api/agency-settings') {
    try {
      const settings = await request.json();
      await setAgencySettings(env, settings);
      return new Response(JSON.stringify({ success: true, settings }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // PUT /change-password
  if (request.method === 'PUT' && path === '/__admin/api/change-password') {
    try {
      const body = await request.json();
      const { currentPassword, newPassword } = body;

      if (!currentPassword || !newPassword) {
        return new Response(
          JSON.stringify({ error: 'currentPassword and newPassword required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Validate current password
      const passwordOverride = await env.BRANDS.get('admin:password_override');
      const validPassword = passwordOverride ? currentPassword === passwordOverride : currentPassword === env.ADMIN_KEY;

      if (!validPassword) {
        return new Response(JSON.stringify({ error: 'Current password is incorrect' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Store new password
      await setPasswordOverride(env, newPassword);

      return new Response(JSON.stringify({ success: true, message: 'Password changed' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // GET /brands
  if (request.method === 'GET' && path === '/__admin/api/brands') {
    const brands = await getAllBrands(env);
    return new Response(JSON.stringify(brands), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // GET /brands/:key
  const getBrandMatch = path.match(/^\/__admin\/api\/brands\/([^/]+)$/);
  if (request.method === 'GET' && getBrandMatch) {
    const brand = await getBrand(env, getBrandMatch[1]);
    if (!brand) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(brand), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // POST /brands
  if (request.method === 'POST' && path === '/__admin/api/brands') {
    try {
      const body = await request.json();
      const { key, name, colors } = body;
      if (!key || !name) {
        return new Response(
          JSON.stringify({ error: 'key and name required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const brand = { name, colors: colors || {}, customCSS: '' };
      await setBrand(env, key, brand);
      return new Response(JSON.stringify({ success: true, brand }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // PUT /brands/:key
  const putBrandMatch = path.match(/^\/__admin\/api\/brands\/([^/]+)$/);
  if (request.method === 'PUT' && putBrandMatch) {
    try {
      const body = await request.json();
      const existingBrand = await getBrand(env, putBrandMatch[1]);
      if (!existingBrand) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const updated = { ...existingBrand, ...body };
      await setBrand(env, putBrandMatch[1], updated);
      return new Response(JSON.stringify({ success: true, brand: updated }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // DELETE /brands/:key
  const deleteBrandMatch = path.match(/^\/__admin\/api\/brands\/([^/]+)$/);
  if (request.method === 'DELETE' && deleteBrandMatch) {
    await deleteBrand(env, deleteBrandMatch[1]);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // POST /sync
  if (request.method === 'POST' && path === '/__admin/api/sync') {
    try {
      const body = await request.json();
      const { ghlKey } = body;
      if (!ghlKey) {
        return new Response(
          JSON.stringify({ error: 'ghlKey required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const result = await syncBrandsFromGHL(env, ghlKey);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Generate admin HTML with React UI
async function getAdminHTML(env) {
  const agencySettings = await getAgencySettings(env);
  const brands = await getAllBrands(env);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GHL Brand Injector Admin</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect } = React;

    const ColorPicker = ({ label, value, onChange }) => (
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
        <div className="flex items-center gap-2">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-12 h-10 border rounded cursor-pointer" />
          <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </div>
      </div>
    );

    const AgencySettingsPanel = ({ onClose, onSave }) => {
      const [settings, setSettings] = useState(${JSON.stringify(agencySettings)});
      const [loading, setLoading] = useState(false);

      const handleSave = async () => {
        setLoading(true);
        try {
          const response = await fetch('/__admin/api/agency-settings', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': \`Bearer \${localStorage.getItem('adminToken')}\`,
            },
            body: JSON.stringify(settings),
          });
          if (response.ok) {
            alert('Agency settings saved');
            onSave && onSave();
          } else {
            alert('Failed to save settings');
          }
        } catch (e) {
          alert('Error: ' + e.message);
        } finally {
          setLoading(false);
        }
      };

      return (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
          <div className="relative ml-auto w-full max-w-md max-h-screen bg-white shadow-lg overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Agency Settings</h2>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            <div className="p-6 space-y-6">
              {/* Agency Identity */}
              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Agency Identity</h3>
                <input
                  type="text"
                  placeholder="Agency Name"
                  value={settings.agencyName}
                  onChange={(e) => setSettings({ ...settings, agencyName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md mb-3"
                />
                <input
                  type="text"
                  placeholder="Logo URL"
                  value={settings.agencyLogo}
                  onChange={(e) => setSettings({ ...settings, agencyLogo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md mb-3"
                />
                {settings.agencyLogo && <img src={settings.agencyLogo} alt="Logo" className="h-12 object-contain" />}
              </section>

              {/* Default Theme */}
              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Default Theme</h3>
                <ColorPicker label="Gradient Left" value={settings.defaultColors.gradLeft} onChange={(v) => setSettings({ ...settings, defaultColors: { ...settings.defaultColors, gradLeft: v } })} />
                <ColorPicker label="Gradient Mid" value={settings.defaultColors.gradMid} onChange={(v) => setSettings({ ...settings, defaultColors: { ...settings.defaultColors, gradMid: v } })} />
                <ColorPicker label="Gradient Right" value={settings.defaultColors.gradRight} onChange={(v) => setSettings({ ...settings, defaultColors: { ...settings.defaultColors, gradRight: v } })} />
                <ColorPicker label="Gradient Underline" value={settings.defaultColors.gradUnderline} onChange={(v) => setSettings({ ...settings, defaultColors: { ...settings.defaultColors, gradUnderline: v } })} />
                <ColorPicker label="Chip Green" value={settings.defaultColors.chipGreen} onChange={(v) => setSettings({ ...settings, defaultColors: { ...settings.defaultColors, chipGreen: v } })} />
                <ColorPicker label="Surface Blue" value={settings.defaultColors.surfaceBlue} onChange={(v) => setSettings({ ...settings, defaultColors: { ...settings.defaultColors, surfaceBlue: v } })} />
                <ColorPicker label="Text Strong" value={settings.defaultColors.textStrong} onChange={(v) => setSettings({ ...settings, defaultColors: { ...settings.defaultColors, textStrong: v } })} />
                <ColorPicker label="Text Muted" value={settings.defaultColors.textMuted} onChange={(v) => setSettings({ ...settings, defaultColors: { ...settings.defaultColors, textMuted: v } })} />
              </section>

              {/* GHL Agency Key */}
              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">GHL Agency Key</h3>
                <input
                  type="password"
                  placeholder="GHL Agency Key"
                  value={settings.ghlAgencyKey}
                  onChange={(e) => setSettings({ ...settings, ghlAgencyKey: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </section>

              {/* Admin Password */}
              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Admin Password</h3>
                <PasswordChangeForm />
              </section>

              <button
                onClick={handleSave}
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      );
    };

    const PasswordChangeForm = () => {
      const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
      const [loading, setLoading] = useState(false);

      const handleChange = async () => {
        if (form.newPassword !== form.confirmPassword) {
          alert('Passwords do not match');
          return;
        }
        setLoading(true);
        try {
          const response = await fetch('/__admin/api/change-password', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': \`Bearer \${localStorage.getItem('adminToken')}\`,
            },
            body: JSON.stringify({
              currentPassword: form.currentPassword,
              newPassword: form.newPassword,
            }),
          });
          const data = await response.json();
          if (response.ok) {
            alert('Password changed successfully');
            setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
          } else {
            alert('Error: ' + data.error);
          }
        } catch (e) {
          alert('Error: ' + e.message);
        } finally {
          setLoading(false);
        }
      };

      return (
        <div className="space-y-3">
          <input
            type="password"
            placeholder="Current Password"
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <input
            type="password"
            placeholder="New Password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <input
            type="password"
            placeholder="Confirm Password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <button
            onClick={handleChange}
            disabled={loading}
            className="w-full bg-red-600 text-white py-2 rounded-md text-sm hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      );
    };

    const AdminApp = () => {
      const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
      const [showPanel, setShowPanel] = useState(false);
      const [brands, setBrands] = useState(${JSON.stringify(brands)});
      const [authenticated, setAuthenticated] = useState(!!token);

      useEffect(() => {
        if (token) {
          localStorage.setItem('adminToken', token);
          setAuthenticated(true);
        }
      }, [token]);

      if (!authenticated) {
        return (
          <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
              <h1 className="text-2xl font-bold mb-6 text-center">Admin Login</h1>
              <input
                type="password"
                placeholder="Enter admin key"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && setToken(token)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md mb-4"
              />
              <button
                onClick={() => setAuthenticated(true)}
                className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
              >
                Login
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-gray-50">
          <header className="bg-white border-b">
            <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
              <h1 className="text-2xl font-bold">Brand Manager</h1>
              <div className="flex items-center gap-4">
                <button onClick={() => setShowPanel(true)} className="p-2 hover:bg-gray-100 rounded-full" title="Agency Settings">⚙️</button>
                <button onClick={() => { localStorage.removeItem('adminToken'); setAuthenticated(false); }} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md">Logout</button>
              </div>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-6 py-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(brands).map(([key, brand]) => (
                <div key={key} className="bg-white rounded-lg shadow p-6">
                  <h3 className="font-bold text-lg mb-2">{brand.name}</h3>
                  <p className="text-gray-600 text-sm mb-4">Key: {key}</p>
                  <div className="space-y-2">
                    <button className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Edit</button>
                    <button className="w-full px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </main>

          {showPanel && <AgencySettingsPanel onClose={() => setShowPanel(false)} />}
        </div>
      );
    };

    ReactDOM.render(<AdminApp />, document.getElementById('root'));
  </script>
</body>
</html>
  `;
}

// Main fetch handler
async function handleRequest(env, request) {
  const url = new URL(request.url);

  // Admin panel routes
  if (url.pathname === '/__admin') {
    const html = await getAdminHTML(env);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Admin API
  if (url.pathname.startsWith('/__admin/api/')) {
    return handleAdminAPI(env, request, url.pathname);
  }

  // Brand injection - check query param for brand key
  const brandKey = url.searchParams.get('brand');
  if (brandKey) {
    // Proxy to GHL and inject brand
    const response = await fetch(request.clone());
    const text = await response.text();

    const script = await buildBrandScript(env, brandKey);
    if (script) {
      return new HTMLRewriter()
        .on('body', new BrandInjector(script))
        .transform(new Response(text, response));
    }
    return new Response(text, response);
  }

  // Default proxy to GHL
  return fetch(request);
}

// Scheduled event handler
export async function scheduled(event, env, ctx) {
  // Refresh brand cache or perform maintenance
  // This runs on a schedule defined in wrangler.toml
}

// Main export
export default {
  fetch: (request, env, ctx) => handleRequest(env, request),
  scheduled: scheduled,
};

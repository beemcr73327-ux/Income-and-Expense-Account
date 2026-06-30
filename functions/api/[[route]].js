// Helper to format date to Thai locale strings
function formatThaiDate(dateStr) {
  const date = new Date(dateStr);
  const formatter = new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return formatter.format(date);
}

// === นำ URL ของ Google Apps Script มาวางในเครื่องหมายคำพูดด้านล่างนี้ ===
// ตัวอย่าง: const HARDCODED_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfyc.../exec";
const HARDCODED_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwJU4bpiYSOYMPE2OG4EnWu4u_Dkmo6ljYjVSZzkJyRwhMRk2aAp7hgLd2x1grq9fMe/exec"; 
// ======================================================================

// Ensure valid response format
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// Function to handle Google Sheets API calls via Apps Script Webhook
async function appendToGoogleSheet(env, transaction) {
  try {
    const appsScriptUrl = env.GOOGLE_APPS_SCRIPT_URL || HARDCODED_APPS_SCRIPT_URL;
    if (!appsScriptUrl) {
      console.warn("GOOGLE_APPS_SCRIPT_URL is not set. Skipping Google Sheets sync.");
      return;
    }

    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(transaction)
    });

    if (!response.ok) {
      console.error("Google Sheets Apps Script error:", await response.text());
    }
  } catch (error) {
    console.error("Failed to sync with Google Sheets Apps Script:", error);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }
    });
  }

  try {
    // 0. Debug DB
    if (path === '/api/debug-db' && request.method === 'GET') {
      try {
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            type TEXT NOT NULL,
            category TEXT NOT NULL,
            amount REAL NOT NULL,
            note TEXT,
            saving_type TEXT,
            saving_group TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `).run();
        await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`).run();
        await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`).run();
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS sync_data (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `).run();
        return jsonResponse({ status: "success", message: "DB Initialized" });
      } catch (e) {
        return jsonResponse({ error: e.message, stack: e.stack }, 500);
      }
    }

    // 1. GET /api/config
    if (path === '/api/config' && request.method === 'GET') {
      try {
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            type TEXT NOT NULL,
            category TEXT NOT NULL,
            amount REAL NOT NULL,
            note TEXT,
            saving_type TEXT,
            saving_group TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `).run();
        await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`).run();
        await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`).run();
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS sync_data (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `).run();
      } catch (dbError) {
        console.error("DB Init Error:", dbError);
      }
      return jsonResponse({ status: "success", message: "Cloudflare Backend is running" });
    }

    // 2. POST /api/sync
    if (path === '/api/sync' && request.method === 'POST') {
      const appsScriptUrl = env.GOOGLE_APPS_SCRIPT_URL || HARDCODED_APPS_SCRIPT_URL;
      if (!appsScriptUrl) return jsonResponse({ error: "No Apps Script URL" }, 400);
      
      const res = await fetch(appsScriptUrl);
      const data = await res.json();
      
      if (data.status === 'success') {
        await env.DB.prepare("INSERT INTO sync_data (key, value, updated_at) VALUES ('raw_sheet', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(data.data)).run();
        return jsonResponse({ success: true });
      }
      return jsonResponse({ error: "Failed to fetch from Google Sheets" }, 500);
    }

    // 3. GET /api/categories
    if (path === '/api/categories' && request.method === 'GET') {
      let raw = null;
      try {
        const row = await env.DB.prepare("SELECT value FROM sync_data WHERE key = 'raw_sheet'").first();
        if (row) raw = JSON.parse(row.value);
      } catch (e) {
        console.error("No sync data found");
      }

      let categories = {
        "รายจ่าย": ["อาหาร", "เดินทาง", "ของใช้ส่วนตัว"],
        "รายรับ": ["เงินเดือน", "อื่นๆ"],
        "เงินออม/ลงทุน": ["หุ้น", "กองทุน"],
        "saving_groups": ["Port 1", "Port 2"],
        "saving_types": ["ซื้อ", "ขาย", "ออม", "spend"]
      };

      if (raw && raw.length > 70) {
        categories["รายรับ"] = [];
        for (let i = 8; i <= 27; i++) if (raw[i][1]) categories["รายรับ"].push(raw[i][1]);
        
        categories["รายจ่าย"] = [];
        for (let i = 32; i <= 49; i++) if (raw[i][1]) categories["รายจ่าย"].push(raw[i][1]);
        
        categories["saving_groups"] = [];
        for (let i = 54; i <= 72; i++) if (raw[i][1]) categories["saving_groups"].push(raw[i][1]);
      }
      return jsonResponse(categories);
    }

    // 4. POST /api/transaction
    if (path === '/api/transaction' && request.method === 'POST') {
      const body = await request.json();
      const category = body.category || body.name;
      const { date, type, amount, note, saving_type, saving_group } = body;

      if (!date || !type || !category || amount == null) {
        return jsonResponse({ error: "Missing required fields" }, 400);
      }

      // Save to D1
      const result = await env.DB.prepare(
        "INSERT INTO transactions (date, type, category, amount, note, saving_type, saving_group) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(date, type, category, amount, note || "", saving_type || "", saving_group || "").run();

      // Async sync to Google Sheets
      context.waitUntil(appendToGoogleSheet(env, { date, type, category, amount, note, saving_type, saving_group }));

      return jsonResponse({ success: true, id: result.lastRowId });
    }

    // 5. GET /api/transactions
    if (path === '/api/transactions' && request.method === 'GET') {
      const year = url.searchParams.get('year');
      const month = url.searchParams.get('month');
      
      let query = "SELECT * FROM transactions";
      let params = [];
      
      if (year && month) {
        const paddedMonth = month.padStart(2, '0');
        const prefix = `${year}-${paddedMonth}-`;
        query += " WHERE date LIKE ?";
        params.push(`${prefix}%`);
      }
      
      query += " ORDER BY date DESC, id DESC LIMIT 100";
      
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return jsonResponse(results);
    }

    // 6. GET /api/summary
    if (path === '/api/summary' && request.method === 'GET') {
      const year = url.searchParams.get('year');
      const month = url.searchParams.get('month');
      
      let query = "SELECT type, SUM(amount) as total FROM transactions";
      let params = [];
      
      if (year && month) {
        const paddedMonth = month.padStart(2, '0');
        const prefix = `${year}-${paddedMonth}-`;
        query += " WHERE date LIKE ?";
        params.push(`${prefix}%`);
      }
      
      query += " GROUP BY type";
      
      const { results } = await env.DB.prepare(query).bind(...params).all();
      
      const summary = {
        "รายรับ": 0,
        "รายจ่าย": 0,
        "เงินออม/ลงทุน": 0
      };
      
      results.forEach(row => {
        if (summary[row.type] !== undefined) {
          summary[row.type] = row.total;
        } else if (row.type === 'saving' || row.type === 'ออม') {
          summary["เงินออม/ลงทุน"] += row.total;
        }
      });
      
      summary["ยอดคงเหลือ"] = summary["รายรับ"] - summary["รายจ่าย"] - summary["เงินออม/ลงทุน"];
      
      return jsonResponse(summary);
    }

    // 7. GET /api/budget
    if (path === '/api/budget' && request.method === 'GET') {
      const year = url.searchParams.get('year');
      const month = url.searchParams.get('month');
      
      let raw = null;
      try {
        const row = await env.DB.prepare("SELECT value FROM sync_data WHERE key = 'raw_sheet'").first();
        if (row) raw = JSON.parse(row.value);
      } catch (e) {}

      let limits = {};
      
      if (raw && raw.length > 50 && month) {
        const monthIndex = parseInt(month, 10) - 1; // 0 to 11
        const colIndex = 58 + monthIndex; // BG is index 58 (0-indexed A=0? Wait, A is 0, B is 1... BG is 58)
        
        for (let i = 32; i <= 49; i++) { // B33:B50 -> rows 32-49
          const cat = raw[i][1]; // Column B is index 1
          if (cat) {
            limits[cat] = parseFloat(raw[i][colIndex]) || 0;
          }
        }
      }

      // Fetch current usage for expenses
      let query = "SELECT category, SUM(amount) as used FROM transactions WHERE type = 'รายจ่าย'";
      let params = [];
      
      if (year && month) {
        const paddedMonth = month.padStart(2, '0');
        const prefix = `${year}-${paddedMonth}-`;
        query += " AND date LIKE ?";
        params.push(`${prefix}%`);
      }
      
      query += " GROUP BY category";
      const { results } = await env.DB.prepare(query).bind(...params).all();
      
      const usage = {};
      results.forEach(row => {
        usage[row.category] = row.used;
      });
      
      const budgetResult = Object.keys(limits).map(category => ({
        category,
        limit: limits[category],
        used: usage[category] || 0
      }));
      
      return jsonResponse(budgetResult);
    }

    return jsonResponse({ error: "Not Found" }, 404);
  } catch (error) {
    console.error("API Error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
}

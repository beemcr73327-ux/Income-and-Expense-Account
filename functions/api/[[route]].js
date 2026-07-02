// Helper to format date to Thai locale strings
function formatThaiDate(dateStr) {
  const date = new Date(dateStr);
  const formatter = new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return formatter.format(date);
}

// === นำ URL ของ Google Apps Script มาวางในเครื่องหมายคำพูดด้านล่างนี้ ===
// ตัวอย่าง: const HARDCODED_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfyc.../exec";
const HARDCODED_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbygIQbgzWmXk0QdI84wE_FmCu4e1h-t5KZnTSHREPVsfZGBxMSfVbmJ9ZC9VCQMaXMROg/exec"; 
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

    // 1.5 GET /api/reset (Clear Database History)
    if (path === '/api/reset' && request.method === 'GET') {
      const key = url.searchParams.get('key');
      if (key !== 'clear1234') {
        return jsonResponse({ error: "Unauthorized. Please provide the correct key." }, 401);
      }
      try {
        await env.DB.prepare("DELETE FROM transactions").run();
        await env.DB.prepare("DELETE FROM sync_data").run();
        return jsonResponse({ success: true, message: "ประวัติการบันทึกถูกลบเรียบร้อยแล้ว (Database has been reset successfully.)" });
      } catch (e) {
        return jsonResponse({ error: "Failed to reset database", details: e.message }, 500);
      }
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

    // 4.5 PUT /api/transaction (Update)
    if (path === '/api/transaction' && request.method === 'PUT') {
      const body = await request.json();
      const { id, date, type, category, amount, note, saving_type, saving_group } = body;
      
      if (!id || !date || !type || !category || amount == null) {
        return jsonResponse({ error: "Missing required fields" }, 400);
      }
      
      try {
        await env.DB.prepare(
          "UPDATE transactions SET date=?, type=?, category=?, amount=?, note=?, saving_type=?, saving_group=? WHERE id=?"
        ).bind(date, type, category, amount, note || "", saving_type || "", saving_group || "", id).run();
        return jsonResponse({ success: true });
      } catch (e) {
        return jsonResponse({ error: "Update failed", details: e.message }, 500);
      }
    }

    // 4.6 DELETE /api/transaction (Delete)
    if (path === '/api/transaction' && request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return jsonResponse({ error: "Missing ID" }, 400);
      
      try {
        await env.DB.prepare("DELETE FROM transactions WHERE id=?").bind(id).run();
        return jsonResponse({ success: true });
      } catch (e) {
        return jsonResponse({ error: "Delete failed", details: e.message }, 500);
      }
    }

    // 5. GET /api/transactions
    if (path === '/api/transactions' && request.method === 'GET') {
      const year = url.searchParams.get('year');
      const month = url.searchParams.get('month');
      const dateParam = url.searchParams.get('date');
      
      let query = "SELECT * FROM transactions";
      let params = [];
      
      if (dateParam) {
        query += " WHERE date = ?";
        params.push(dateParam);
      } else if (year && month) {
        const paddedMonth = month.padStart(2, '0');
        query += " WHERE date LIKE ?";
        params.push(`${year}-${paddedMonth}-%`);
      } else if (year) {
        query += " WHERE date LIKE ?";
        params.push(`${year}-%`);
      }
      
      query += " ORDER BY date DESC, id DESC LIMIT 100";
      
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return jsonResponse(results);
    }

    // 6. GET /api/summary
    if (path === '/api/summary' && request.method === 'GET') {
      const year = url.searchParams.get('year');
      const month = url.searchParams.get('month');
      const dateParam = url.searchParams.get('date');
      
      let query = "SELECT type, SUM(amount) as total FROM transactions";
      let params = [];
      
      if (dateParam) {
        query += " WHERE date = ?";
        params.push(dateParam);
      } else if (year && month) {
        const paddedMonth = month.padStart(2, '0');
        query += " WHERE date LIKE ?";
        params.push(`${year}-${paddedMonth}-%`);
      } else if (year) {
        query += " WHERE date LIKE ?";
        params.push(`${year}-%`);
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
      const dateParam = url.searchParams.get('date');
      
      let raw = null;
      try {
        const row = await env.DB.prepare("SELECT value FROM sync_data WHERE key = 'raw_sheet'").first();
        if (row) raw = JSON.parse(row.value);
      } catch (e) {}

      let limits = {};
      
      if (raw && raw.length > 50) {
        const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();
        // 2026 starts at column BG (index 58)
        // Each year takes 14 columns: 12 months + 1 yearly total + 1 gap
        const startCol = 58 + (targetYear - 2026) * 14;
        
        let colIndex;
        if (month) {
          const monthIndex = parseInt(month, 10) - 1; // 0 to 11
          colIndex = startCol + monthIndex;
        } else {
          // Yearly budget is located right after the 12 months
          colIndex = startCol + 12;
        }
        
        for (let i = 32; i <= 49; i++) { // B33:B50 -> rows 32-49 (expense categories)
          const cat = raw[i][1]; // Column B is index 1
          if (cat) {
            if (month) {
              limits[cat] = parseFloat(raw[i][colIndex]) || 0;
            } else {
              // Yearly view: Sum all 12 months (startCol to startCol + 11) 
              // plus fallback to BS column (startCol + 12) if it exists, though summing is safer
              let yearlySum = 0;
              for (let m = 0; m < 12; m++) {
                 yearlySum += parseFloat(raw[i][startCol + m]) || 0;
              }
              // In case they manually put a larger yearly budget in BS, we could take max,
              // but summing is what they requested ("รวมมาจากแต่ละรายการแต่ละเดือน")
              const bsValue = parseFloat(raw[i][startCol + 12]) || 0;
              limits[cat] = yearlySum > 0 ? yearlySum : bsValue;
            }
          }
        }
      }

      // Fetch current usage for expenses
      let query = "SELECT category, SUM(amount) as used FROM transactions WHERE type IN ('expense', 'รายจ่าย')";
      let params = [];
      
      if (dateParam) {
        query += " AND date = ?";
        params.push(dateParam);
      } else if (year && month) {
        const paddedMonth = month.padStart(2, '0');
        query += " AND date LIKE ?";
        params.push(`${year}-${paddedMonth}-%`);
      } else if (year) {
        query += " AND date LIKE ?";
        params.push(`${year}-%`);
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

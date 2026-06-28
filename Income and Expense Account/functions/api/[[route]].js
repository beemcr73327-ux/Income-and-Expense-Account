import { getGoogleAuthToken } from './google_jwt.js';

// Helper to format date to Thai locale strings
function formatThaiDate(dateStr) {
  const date = new Date(dateStr);
  const formatter = new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return formatter.format(date);
}

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

// Function to handle Google Sheets API calls
async function appendToGoogleSheet(env, transaction) {
  try {
    const serviceAccountJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      console.warn("GOOGLE_SERVICE_ACCOUNT_JSON is not set. Skipping Google Sheets sync.");
      return;
    }

    const token = await getGoogleAuthToken(serviceAccountJson);
    const sheetId = env.GOOGLE_SHEET_ID;
    const range = 'บันทึกรายรับรายจ่าย!B:F'; // Adjust based on your sheet structure

    // Assuming columns are: [Date, Empty, Type, Category, Empty, Amount, Note] or similar based on server.py
    // This part should match the exact columns mapped in your python code
    // Assuming columns: B=Date, C=Type, D=Category, E=Amount, F=Note (Adjust according to actual structure)
    const values = [
      [transaction.date, transaction.type, transaction.category, transaction.amount, transaction.note || ""]
    ];

    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: values
      })
    });

    if (!response.ok) {
      console.error("Google Sheets API error:", await response.text());
    }
  } catch (error) {
    console.error("Failed to sync with Google Sheets:", error);
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
    // 1. GET /api/config
    if (path === '/api/config' && request.method === 'GET') {
      return jsonResponse({ status: "success", message: "Cloudflare Backend is running" });
    }

    // 2. GET /api/categories
    if (path === '/api/categories' && request.method === 'GET') {
      // Return basic categories (could be fetched from D1 or hardcoded)
      const categories = {
        "รายจ่าย": ["อาหาร", "เดินทาง", "ของใช้ส่วนตัว", "เครื่องดื่ม", "Enjoy", "7-ELEVEN", "ของใช้", "อื่นๆ"],
        "รายรับ": ["เงินเดือน", "โบนัส", "อื่นๆ"],
        "เงินออม/ลงทุน": ["เงินออมฉุกเฉิน", "หุ้น", "กองทุน"]
      };
      return jsonResponse(categories);
    }

    // 3. POST /api/transaction
    if (path === '/api/transaction' && request.method === 'POST') {
      const body = await request.json();
      const { date, type, category, amount, note } = body;

      if (!date || !type || !category || amount == null) {
        return jsonResponse({ error: "Missing required fields" }, 400);
      }

      // Save to D1
      const result = await env.DB.prepare(
        "INSERT INTO transactions (date, type, category, amount, note) VALUES (?, ?, ?, ?, ?)"
      ).bind(date, type, category, amount, note || "").run();

      // Async sync to Google Sheets (don't await to block the response)
      context.waitUntil(appendToGoogleSheet(env, { date, type, category, amount, note }));

      return jsonResponse({ success: true, id: result.lastRowId });
    }

    // 4. GET /api/transactions
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

    // 5. GET /api/summary
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
        }
      });
      
      summary["ยอดคงเหลือ"] = summary["รายรับ"] - summary["รายจ่าย"] - summary["เงินออม/ลงทุน"];
      
      return jsonResponse(summary);
    }

    // 6. GET /api/budget
    if (path === '/api/budget' && request.method === 'GET') {
      const year = url.searchParams.get('year');
      const month = url.searchParams.get('month');
      
      // Fetch budget config (Hardcoded for now as per budget_config.json, or from D1)
      const limits = {
        "อาหาร": 8000,
        "เดินทาง": 3000,
        "ของใช้ส่วนตัว": 2000,
        "เครื่องดื่ม": 1500,
        "Enjoy": 3000,
        "7-ELEVEN": 1500,
        "ของใช้": 2000,
        "อื่นๆ": 2000
      };
      
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

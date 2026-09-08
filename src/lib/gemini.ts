export interface ParsedInvoice {
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  customer_state?: string;
  customer_gstin?: string;
  items: {
    description: string;
    hsn?: string;
    qty: number;
    rate: number;
    gst_rate: number;
  }[];
  payment_status: 'paid' | 'pending' | 'partial';
  paid_amount?: number;
  notes?: string;
}

/**
 * Intelligent client-side fallback parser for Hindi / Hinglish / English billing text
 * Used when network / API key is not ready, guaranteeing the user never gets blocked.
 */
function fallbackParsePrompt(
  prompt: string,
  existingProducts?: { name: string; rate: number; gstRate: number; hsn?: string }[]
): ParsedInvoice {
  const cleanPrompt = prompt.trim();

  // 1. Detect Phone Number (10 digits starting with 6-9)
  const phoneMatch = cleanPrompt.match(/\b([6-9]\d{9})\b/);
  const customer_phone = phoneMatch ? phoneMatch[1] : '';

  // 2. Detect Payment Status
  const lowerPrompt = cleanPrompt.toLowerCase();
  let payment_status: 'paid' | 'pending' | 'partial' = 'pending';
  let paid_amount = 0;

  if (
    lowerPrompt.includes('paid') ||
    lowerPrompt.includes('rokr') ||
    lowerPrompt.includes('rokar') ||
    lowerPrompt.includes('cash diya') ||
    lowerPrompt.includes('jama kar diya') ||
    lowerPrompt.includes('gpay') ||
    lowerPrompt.includes('phonepe') ||
    lowerPrompt.includes('online de diya')
  ) {
    payment_status = 'paid';
  } else if (
    lowerPrompt.includes('aadha') ||
    lowerPrompt.includes('adha') ||
    lowerPrompt.includes('partial') ||
    lowerPrompt.includes('advance')
  ) {
    payment_status = 'partial';
  } else if (
    lowerPrompt.includes('udhaar') ||
    lowerPrompt.includes('udhar') ||
    lowerPrompt.includes('baaki') ||
    lowerPrompt.includes('baki') ||
    lowerPrompt.includes('unpaid') ||
    lowerPrompt.includes('pending')
  ) {
    payment_status = 'pending';
  }

  // 3. Detect Customer Name
  let customer_name = 'Cash Customer';
  // Common patterns: "Rahul ko", "Suresh Sharma ko", "Mr. Sharma ko", "Mohan Lal - 2 piece"
  const koMatch = cleanPrompt.match(/^([A-Za-z\u0900-\u097F\s.]+?)\s+(?:ko|se|ji|ke liye)\b/i);
  if (koMatch && koMatch[1].trim().length > 1) {
    customer_name = koMatch[1].trim();
  } else {
    // If starts with a name before numbers
    const namePrefixMatch = cleanPrompt.match(/^([A-Za-z\u0900-\u097F]+(?:\s+[A-Za-z\u0900-\u097F]+)?)\s+(?:\d+|ko)/);
    if (namePrefixMatch && !['ek', 'do', 'teen', 'char', 'bill', 'naya', 'invoice'].includes(namePrefixMatch[1].toLowerCase())) {
      customer_name = namePrefixMatch[1].trim();
    }
  }

  // 4. Detect GST Rate
  let defaultGstRate = 18;
  const gstMatch = lowerPrompt.match(/(\d{1,2})\s*%\s*(?:gst|tax)?/);
  if (gstMatch) {
    defaultGstRate = parseInt(gstMatch[1], 10);
  }

  // 5. Detect Items & Rates
  const items: ParsedInvoice['items'] = [];

  // Check if any existing product is mentioned
  if (existingProducts && existingProducts.length > 0) {
    for (const prod of existingProducts) {
      const prodRegex = new RegExp(`\\b${prod.name}\\b`, 'i');
      if (prodRegex.test(cleanPrompt)) {
        // Find qty near product or default to 1
        const qtyMatch = cleanPrompt.match(new RegExp(`(\\d+)\\s*(?:piece|pcs|packet|pkt|kg|nag|taan)?\\s*${prod.name}`, 'i'))
          || cleanPrompt.match(new RegExp(`${prod.name}\\s*(\\d+)`, 'i'));
        const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

        // Find rate override if any
        const rateMatch = cleanPrompt.match(/(?:rate|at|@|rupaye|rs|inr|₹)\s*(\d+(?:\.\d+)?)/i)
          || cleanPrompt.match(/(\d+(?:\.\d+)?)\s*(?:ka|ki|rate|rupaye|rs)/i);
        const rate = rateMatch ? parseFloat(rateMatch[1]) : prod.rate;

        items.push({
          description: prod.name,
          hsn: prod.hsn || '',
          qty: qty || 1,
          rate: rate || prod.rate || 100,
          gst_rate: prod.gstRate ?? defaultGstRate
        });
      }
    }
  }

  // If no catalog product was matched, extract generic item
  if (items.length === 0) {
    // Look for quantity and rate
    // e.g., "3 shirt 500 rate", "2 fan 1500 each", "5 cement bori 380"
    const generalItemMatch = cleanPrompt.match(/(?:(\d+)\s*(?:piece|pcs|pkt|packet|bori|box|nag)?\s+)?([A-Za-z\u0900-\u097F\s]{2,20}?)(?:\s+(?:ka|ki|ke|rate|at|@|rupaye|rs|₹)?\s*(\d+(?:\.\d+)?))/i);
    
    let description = 'General Goods';
    let qty = 1;
    let rate = 500;

    if (generalItemMatch) {
      if (generalItemMatch[1]) qty = parseInt(generalItemMatch[1], 10);
      if (generalItemMatch[2] && generalItemMatch[2].trim().length > 1) {
        const cleanedDesc = generalItemMatch[2].replace(/\b(ko|se|ka|ki|ke|rupaye|rs|rate|gst|unpaid|paid)\b/gi, '').trim();
        if (cleanedDesc) description = cleanedDesc;
      }
      if (generalItemMatch[3]) rate = parseFloat(generalItemMatch[3]);
    } else {
      // Fallback: extract any numbers for rate and qty
      const numbers = cleanPrompt.match(/\d+(?:\.\d+)?/g);
      if (numbers) {
        if (numbers.length >= 2) {
          qty = parseInt(numbers[0], 10) || 1;
          rate = parseFloat(numbers[1]) || 500;
        } else if (numbers.length === 1) {
          rate = parseFloat(numbers[0]) || 500;
        }
      }
    }

    items.push({
      description,
      hsn: '',
      qty: Math.max(1, qty),
      rate: Math.max(0, rate),
      gst_rate: defaultGstRate
    });
  }

  return {
    customer_name,
    customer_phone,
    customer_address: '',
    customer_state: 'Rajasthan',
    items,
    payment_status,
    paid_amount,
    notes: 'Generated via BillAI Hindi Assistant'
  };
}

export async function parseHindiPrompt(
  prompt: string,
  existingProducts?: { name: string; rate: number; gstRate: number; hsn?: string }[]
): Promise<ParsedInvoice> {
  try {
    const res = await fetch('/api/gemini/parse-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, existingProducts })
    });

    if (!res.ok) {
      console.warn(`Server API responded with ${res.status}, using smart fallback parser.`);
      return fallbackParsePrompt(prompt, existingProducts);
    }

    const data = await res.json();
    if (data && data.items && Array.isArray(data.items) && data.items.length > 0) {
      return {
        customer_name: data.customer_name || 'Cash Customer',
        customer_phone: data.customer_phone || '',
        customer_address: data.customer_address || '',
        customer_state: data.customer_state || 'Rajasthan',
        customer_gstin: data.customer_gstin || '',
        items: data.items.map((it: any) => ({
          description: it.description || 'Item',
          hsn: it.hsn || '',
          qty: Number(it.qty) || 1,
          rate: Number(it.rate) || 0,
          gst_rate: Number(it.gst_rate) ?? 18
        })),
        payment_status: data.payment_status || 'pending',
        paid_amount: Number(data.paid_amount) || 0,
        notes: data.notes || ''
      };
    }

    return fallbackParsePrompt(prompt, existingProducts);
  } catch (err) {
    console.warn('Network error reaching Gemini backend, using smart fallback parser:', err);
    return fallbackParsePrompt(prompt, existingProducts);
  }
}

export async function parseInvoiceImage(
  base64Image: string,
  mimeType: string,
  existingProducts?: { name: string; rate: number; gstRate: number; hsn?: string }[]
): Promise<ParsedInvoice> {
  try {
    const res = await fetch('/api/gemini/parse-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image, mimeType, existingProducts })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server returned ${res.status}`);
    }

    const data = await res.json();
    if (data && data.items && Array.isArray(data.items) && data.items.length > 0) {
      return {
        customer_name: data.customer_name || 'Cash Customer',
        customer_phone: data.customer_phone || '',
        customer_address: data.customer_address || '',
        customer_state: data.customer_state || 'Rajasthan',
        customer_gstin: data.customer_gstin || '',
        items: data.items.map((it: any) => ({
          description: it.description || 'Item',
          hsn: it.hsn || '',
          qty: Number(it.qty) || 1,
          rate: Number(it.rate) || 0,
          gst_rate: Number(it.gst_rate) ?? 18
        })),
        payment_status: data.payment_status || 'pending',
        paid_amount: Number(data.paid_amount) || 0,
        notes: data.notes || ''
      };
    }

    throw new Error('Image could not be read into invoice items. Please retry or enter manually.');
  } catch (err: any) {
    console.error('parseInvoiceImage error:', err);
    throw err;
  }
}


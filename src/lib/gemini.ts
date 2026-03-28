import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface ParsedInvoice {
  customer_name: string;
  items: {
    description: string;
    qty: number;
    rate: number;
    gst_rate: number;
  }[];
  payment_status: 'paid' | 'pending' | 'partial';
  notes?: string;
}

export async function parseHindiPrompt(prompt: string, existingProducts?: { name: string, rate: number, gstRate: number }[]): Promise<ParsedInvoice> {
  const productsContext = existingProducts && existingProducts.length > 0
    ? `\n\nExisting Products (Use these prices and GST rates if items match):
    ${existingProducts.map(p => `- ${p.name}: ₹${p.rate}, GST ${p.gstRate}%`).join('\n')}`
    : '';

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Parse the following Hindi/Hinglish billing prompt into a structured JSON format for a GST invoice.
    Prompt: "${prompt}"
    ${productsContext}
    
    Rules:
    1. Extract customer name.
    2. Extract items with quantity, rate, and GST rate.
    3. If an item in the prompt matches an "Existing Product" listed above, use its rate and GST rate automatically if not explicitly overridden in the prompt.
    4. Extract payment status (paid, pending, or partial).
    5. If multiple items, list them all.
    6. Return ONLY the JSON object.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          customer_name: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                qty: { type: Type.NUMBER },
                rate: { type: Type.NUMBER },
                gst_rate: { type: Type.NUMBER }
              },
              required: ["description", "qty", "rate", "gst_rate"]
            }
          },
          payment_status: { type: Type.STRING, enum: ["paid", "pending", "partial"] },
          notes: { type: Type.STRING }
        },
        required: ["customer_name", "items", "payment_status"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
}

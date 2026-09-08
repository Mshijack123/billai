import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || "bill-ai-app",
  });
}

const db = admin.firestore();

// Helper for Gemini AI client with telemetry user agent
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in the environment.");
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support JSON and base64 bill image payloads
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));

  // --- Gemini AI Invoice Endpoints ---
  app.post("/api/gemini/parse-prompt", async (req, res) => {
    const { prompt, existingProducts } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt string is required" });
    }

    try {
      const ai = getGeminiClient();

      const productsContext = existingProducts && existingProducts.length > 0
        ? `\n\nExisting Products Catalog (Match item names and use these rates and GST rates if items match):
${existingProducts.map((p: any) => `- ${p.name}: ₹${p.rate}, GST ${p.gstRate}%, HSN: ${p.hsn || 'N/A'}`).join('\n')}`
        : '';

      const systemInstruction = `You are an expert Indian GST billing assistant. Your task is to extract structured JSON data for creating an official GST invoice from Hindi, Hinglish, Devanagari, or English billing text.
Rules:
1. Extract customer_name. If no name is mentioned, return "Cash Customer".
2. Extract customer_phone if a 10-digit number is given.
3. Extract customer_address and customer_state if mentioned.
4. Extract customer_gstin if mentioned.
5. Extract items: array of items with:
   - description: item name
   - hsn: HSN code (if mentioned or matched from catalog)
   - qty: quantity number (default 1)
   - rate: unit price in Rupees before GST (if total price given, divide by qty; if matched with existing product, use product rate)
   - gst_rate: GST percentage (0, 5, 12, 18, 28; default 18)
6. Extract payment_status: 'paid' | 'pending' | 'partial'. Words like 'udhaar', 'baaki', 'unpaid', 'pending' mean 'pending'. Words like 'paid', 'rokr', 'cash', 'jama', 'online' mean 'paid'.
7. Extract paid_amount if partial or paid.
8. Extract notes if any.
Return ONLY valid JSON matching the schema.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `Parse this billing prompt:\n"${prompt}"\n${productsContext}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              customer_name: { type: Type.STRING },
              customer_phone: { type: Type.STRING },
              customer_address: { type: Type.STRING },
              customer_state: { type: Type.STRING },
              customer_gstin: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING },
                    hsn: { type: Type.STRING },
                    qty: { type: Type.NUMBER },
                    rate: { type: Type.NUMBER },
                    gst_rate: { type: Type.NUMBER }
                  },
                  required: ["description", "qty", "rate", "gst_rate"]
                }
              },
              payment_status: { type: Type.STRING, enum: ["paid", "pending", "partial"] },
              paid_amount: { type: Type.NUMBER },
              notes: { type: Type.STRING }
            },
            required: ["customer_name", "items", "payment_status"]
          }
        }
      });

      const parsed = JSON.parse(response.text || "{}");
      res.json(parsed);
    } catch (err: any) {
      console.error("Gemini parse-prompt error:", err);
      res.status(500).json({ error: err.message || "Failed to parse prompt with AI" });
    }
  });

  app.post("/api/gemini/parse-image", async (req, res) => {
    const { image, mimeType, existingProducts } = req.body;
    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Image base64 data is required" });
    }

    try {
      const ai = getGeminiClient();

      const productsContext = existingProducts && existingProducts.length > 0
        ? `\n\nExisting Products Catalog (Match item names and use these rates and GST rates if items match):
${existingProducts.map((p: any) => `- ${p.name}: ₹${p.rate}, GST ${p.gstRate}%, HSN: ${p.hsn || 'N/A'}`).join('\n')}`
        : '';

      const systemInstruction = `You are an expert Indian GST billing assistant. Extract all invoice details from this receipt/bill photo or handwritten parcha into structured JSON.
Rules:
1. Extract customer_name (if not visible, return "Cash Customer").
2. Extract customer_phone, customer_address, customer_state, customer_gstin if present.
3. Extract all line items: description, hsn (if any), qty (number), rate (unit price), and gst_rate (0, 5, 12, 18, 28; default 18).
4. Extract payment_status: 'paid' | 'pending' | 'partial'.
5. Extract paid_amount if partial or paid.
6. Extract notes if any.
Return clean JSON matching the schema.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: {
          parts: [
            {
              inlineData: {
                data: image,
                mimeType: mimeType || "image/jpeg"
              }
            },
            {
              text: `Extract invoice and item details from this bill image.\n${productsContext}`
            }
          ]
        },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              customer_name: { type: Type.STRING },
              customer_phone: { type: Type.STRING },
              customer_address: { type: Type.STRING },
              customer_state: { type: Type.STRING },
              customer_gstin: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING },
                    hsn: { type: Type.STRING },
                    qty: { type: Type.NUMBER },
                    rate: { type: Type.NUMBER },
                    gst_rate: { type: Type.NUMBER }
                  },
                  required: ["description", "qty", "rate", "gst_rate"]
                }
              },
              payment_status: { type: Type.STRING, enum: ["paid", "pending", "partial"] },
              paid_amount: { type: Type.NUMBER },
              notes: { type: Type.STRING }
            },
            required: ["customer_name", "items", "payment_status"]
          }
        }
      });

      const parsed = JSON.parse(response.text || "{}");
      res.json(parsed);
    } catch (err: any) {
      console.error("Gemini parse-image error:", err);
      res.status(500).json({ error: err.message || "Failed to parse invoice image with AI" });
    }
  });

  // Instamojo Configuration
  const INSTAMOJO_API_KEY = process.env.INSTAMOJO_API_KEY;
  const INSTAMOJO_AUTH_TOKEN = process.env.INSTAMOJO_AUTH_TOKEN;
  const INSTAMOJO_SANDBOX = process.env.INSTAMOJO_SANDBOX === "true";
  const INSTAMOJO_URL = process.env.INSTAMOJO_URL || (INSTAMOJO_SANDBOX || process.env.NODE_ENV !== "production" 
    ? "https://test.instamojo.com/api/1.1/" 
    : "https://www.instamojo.com/api/1.1/");

  // API Routes
  app.post("/api/payments/create", async (req, res) => {
    const { amount, purpose, buyer_name, email, phone, userId } = req.body;

    if (!INSTAMOJO_API_KEY || !INSTAMOJO_AUTH_TOKEN) {
      console.error("Instamojo credentials missing");
      return res.status(500).json({ error: "Payment gateway not configured" });
    }

    try {
      const appUrl = process.env.APP_URL?.replace(/\/$/, ""); // Remove trailing slash if any
      
      const response = await axios.post(
        `${INSTAMOJO_URL}payment-requests/`,
        {
          amount,
          purpose,
          buyer_name,
          email,
          phone,
          redirect_url: `${appUrl}/api/payments/callback?userId=${userId}`,
          webhook: `${appUrl}/api/payments/webhook`,
          allow_repeated_payments: false,
        },
        {
          headers: {
            "X-Api-Key": INSTAMOJO_API_KEY,
            "X-Auth-Token": INSTAMOJO_AUTH_TOKEN,
          },
        }
      );

      res.json(response.data);
    } catch (error: any) {
      console.error("Instamojo Error Details:", {
        message: error.message,
        data: error.response?.data,
        status: error.response?.status,
        url: INSTAMOJO_URL
      });
      res.status(500).json({ 
        error: "Failed to create payment request",
        details: error.response?.data || error.message
      });
    }
  });

  app.get("/api/payments/callback", async (req, res) => {
    const { payment_id, payment_status, payment_request_id, userId } = req.query;

    if (payment_status === "Credit") {
      // Update user plan to pro
      try {
        await db.collection("users").doc(userId as string).update({
          plan: "pro",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.redirect("/dashboard?payment=success");
      } catch (error) {
        console.error("Error updating user plan:", error);
        res.redirect("/dashboard?payment=error");
      }
    } else {
      res.redirect("/dashboard?payment=failed");
    }
  });

  app.post("/api/payments/webhook", async (req, res) => {
    // Instamojo sends a POST request to this URL
    // You should verify the MAC signature here for security
    const { payment_id, status, payment_request_id, buyer } = req.body;
    
    // Logic to handle webhook if needed
    console.log("Webhook received:", req.body);
    res.status(200).send("OK");
  });

  app.post("/api/admin/delete-user", async (req, res) => {
    const { targetUserId, adminId } = req.body;

    if (!targetUserId || !adminId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      // Verify the requester is an admin
      const adminDoc = await db.collection("users").doc(adminId).get();
      const adminData = adminDoc.data();
      
      const isDefaultAdmin = adminData?.email === "mshijacknew@gmail.com";
      const isAdminRole = adminData?.role === "admin";

      if (!isDefaultAdmin && !isAdminRole) {
        return res.status(403).json({ error: "Unauthorized. Admin access required." });
      }

      // 1. Delete all invoices
      const invoicesSnapshot = await db.collection("invoices").where("businessId", "==", targetUserId).get();
      const invoiceBatch = db.batch();
      invoicesSnapshot.docs.forEach(doc => invoiceBatch.delete(doc.ref));
      await invoiceBatch.commit();

      // 2. Delete all customers
      const customersSnapshot = await db.collection("customers").where("businessId", "==", targetUserId).get();
      const customerBatch = db.batch();
      customersSnapshot.docs.forEach(doc => customerBatch.delete(doc.ref));
      await customerBatch.commit();

      // 3. Delete all products
      const productsSnapshot = await db.collection("products").where("businessId", "==", targetUserId).get();
      const productBatch = db.batch();
      productsSnapshot.docs.forEach(doc => productBatch.delete(doc.ref));
      await productBatch.commit();

      // 4. Delete user document
      await db.collection("users").doc(targetUserId).delete();

      // 5. Delete user from Firebase Auth
      await admin.auth().deleteUser(targetUserId);

      res.json({ success: true, message: "User and all associated data deleted successfully." });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      res.status(500).json({ 
        error: "Failed to delete user",
        details: error.message
      });
    }
  });

  // Handle specific legacy routes or typos
  app.get(["/Logon", "/logon"], (req, res) => {
    console.log(`Redirecting legacy route: ${req.url} to /login`);
    res.redirect("/login");
  });

  // Vite middleware for development
  const isProd = process.env.NODE_ENV === "production";
  console.log(`Server starting in ${isProd ? "production" : "development"} mode`);
  
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa", // Use 'spa' to handle HTML serving and fallback automatically
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    console.log(`Serving static files from: ${distPath}`);
    
    app.use(express.static(distPath));
    
    app.get("*", (req, res) => {
      const indexPath = path.resolve(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        console.error("Production index.html not found at:", indexPath);
        res.status(404).send("Not Found - Build the app first. If you are in development, set NODE_ENV to development.");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import dotenv from "dotenv";
import admin from "firebase-admin";

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // SPA fallback for development
    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

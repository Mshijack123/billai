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
      appType: "custom", // Use 'custom' to handle HTML serving manually
    });
    app.use(vite.middlewares);

    // SPA fallback for development
    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      // Skip API routes
      if (url.startsWith("/api")) {
        return next();
      }

      try {
        const indexPath = path.resolve(process.cwd(), "index.html");
        
        if (!fs.existsSync(indexPath)) {
          console.error("index.html not found at:", indexPath);
          return next();
        }
        
        let template = fs.readFileSync(indexPath, "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        if (vite) {
          vite.ssrFixStacktrace(e as Error);
        }
        console.error("Vite SPA fallback error:", e);
        next(e);
      }
    });
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

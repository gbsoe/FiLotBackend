import cors from "cors";
import { logger } from "../utils/logger";

const FILOT_FRONTEND_ORIGIN = process.env.FILOT_FRONTEND_ORIGIN || "https://app.filot.id";

const getAllowedOrigins = (): string[] => {
  const origins = [FILOT_FRONTEND_ORIGIN];
  
  if (process.env.NODE_ENV === "development") {
    origins.push("http://localhost:3000", "http://localhost:19000");
  }
  
  return origins.filter(Boolean);
};

export const corsConfig = cors({
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();
    
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    logger.warn("CORS request blocked", { 
      origin, 
      allowedOrigins,
      environment: process.env.NODE_ENV 
    });
    return callback(new Error("Not allowed by CORS"), false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "x-service-key"],
  credentials: true,
});

export const getConfiguredOrigins = (): string[] => getAllowedOrigins();

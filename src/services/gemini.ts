import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const analyzeMarket = async (symbol: string, priceData: any[]) => {
  const model = "gemini-3.1-pro-preview";
  const prompt = `
    Analyze the following price data for ${symbol} and provide a trading recommendation (BUY or HOLD).
    Include a brief rationale based on technical analysis (trends, volatility).
    
    Data (last 20 periods):
    ${JSON.stringify(priceData.slice(-20))}
    
    Format the response as JSON:
    {
      "recommendation": "BUY" | "HOLD",
      "rationale": "string",
      "confidence": number (0-100)
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
      },
    });
    return JSON.parse(response.text || "{}");
  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    
    // Fallback for 429 Quota Exceeded
    if (error?.status === 429 || error?.message?.includes("429") || error?.message?.includes("quota")) {
      const isUp = priceData[priceData.length - 1].price > priceData[priceData.length - 2].price;
      return { 
        recommendation: isUp ? "BUY" : "HOLD", 
        rationale: "API Quota Exceeded. This is a simulated fallback signal based on the last price tick.", 
        confidence: 60 
      };
    }

    return { recommendation: "HOLD", rationale: "Analysis unavailable due to an error.", confidence: 0 };
  }
};

export const chatWithAI = async (message: string, context?: any) => {
  const model = "gemini-3.1-pro-preview";
  const systemInstruction = `
    You are an expert financial trading assistant. 
    You provide insights on market trends, technical indicators, and risk management.
    Be concise, professional, and data-driven.
    Always remind users that trading involves risk and this is not financial advice.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: message }] }],
      config: {
        systemInstruction,
      },
    });
    return response.text;
  } catch (error: any) {
    console.error("Gemini Chat Error:", error);
    
    if (error?.status === 429 || error?.message?.includes("429") || error?.message?.includes("quota")) {
      return "⚠️ **API Quota Exceeded**: I've reached my Gemini API rate limit for now. Please check your Google AI Studio billing details or try again later.";
    }

    return "I'm sorry, I'm having trouble connecting to my brain right now. Please try again later.";
  }
};

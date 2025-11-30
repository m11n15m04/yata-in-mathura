import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateRitualPlan = async (ritualName: string): Promise<string> => {
  try {
    const prompt = `
    You are the Head Pandit and Guide for 'Yatra To Mathura'.
    Context: A pilgrim (Yatri) is visiting the Braj region (Mathura, Vrindavan, Govardhan, Barsana, Gokul).
    User Input: "${ritualName}"

    Your Task:
    1. If the input is a specific ritual (e.g., "Yamuna Pujan", "Chappan Bhog", "Dandavat Parikrama"), provide:
       - Significance of this ritual specifically in the Braj region.
       - The 'Vidhi' (process) summary.
       - A strict list of 'Samagri' (materials) required.

    2. If the input is a travel plan (e.g., "2 days trip", "Mathura Vrindavan Darshan"), provide:
       - A logical itinerary covering key temples (e.g., Krishna Janmabhoomi, Dwarkadhish, Banke Bihari, Prem Mandir, Raman Reti).
       - Best times for Darshan.

    3. Tone: Traditional, respectful, and professional (like a knowledgeable Tirth Purohit).
    4. Format: Plain text with bullet points, suitable for a text area. Do not use Markdown bolding (**), just use dashes or numbers.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "Could not generate details. Please type manually.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error connecting to AI service. Please type details manually.";
  }
};

export const findMatchingFace = async (targetBase64: string, candidates: {id: number, name: string, photo: string}[]) => {
  try {
    if (candidates.length === 0) return null;

    // Limit candidates to avoid payload limits (e.g., 10 most recent)
    const limitedCandidates = candidates.slice(0, 10);

    const prompt = `
    I will provide a 'Target Face'.
    Then I will provide a list of 'Candidate Faces' labeled with their IDs.
    
    Your task:
    Identify if the 'Target Face' matches any of the 'Candidate Faces'.
    
    Return ONLY the JSON object: { "matchFound": boolean, "matchedId": number | null, "confidence": string }
    If no match is found, set matchFound to false.
    `;

    // Prepare parts
    const parts: any[] = [{ text: prompt }];
    
    // Add Target
    parts.push({ text: "TARGET FACE:" });
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: targetBase64.split(',')[1]
      }
    });

    // Add Candidates
    parts.push({ text: "CANDIDATES:" });
    limitedCandidates.forEach(c => {
      parts.push({ text: `ID: ${c.id}, Name: ${c.name}` });
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: c.photo.split(',')[1]
        }
      });
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', // Using a vision-capable model
      contents: { parts },
      config: {
        responseMimeType: 'application/json'
      }
    });

    const resultText = response.text;
    if (!resultText) return null;
    
    const result = JSON.parse(resultText);
    return result.matchFound ? result.matchedId : null;

  } catch (error) {
    console.error("Face Match Error:", error);
    return null;
  }
};
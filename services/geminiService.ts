import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates a detailed ritual or travel plan based on the Braj region traditions.
 */
export const generateRitualPlan = async (ritualName: string): Promise<string> => {
  try {
    const prompt = `
    You are the Head Pandit and Spiritual Guide for 'Yatra To Mathura'.
    Context: A pilgrim (Yatri) is visiting the holy Braj region (Mathura, Vrindavan, Govardhan, Barsana, Gokul, Nandgaon).
    User Input: "${ritualName}"

    Your Task:
    1. If the input is a specific ritual (e.g., "Yamuna Pujan", "Chappan Bhog", "Dandavat Parikrama", "Vrindavan Parikrama"):
       - Explain the spiritual significance in Braj.
       - Provide a step-by-step 'Vidhi' (process).
       - List the required 'Samagri' (materials) with precision.

    2. If the input is a travel plan (e.g., "3 days trip", "Main Temples Visit"):
       - Create a logical itinerary starting from Mathura.
       - Mention key temples: Krishna Janmabhoomi, Dwarkadhish, Banke Bihari, Radha Vallabh, Prem Mandir, ISKCON, Nidhivan.
       - Include tips on Aarti timings and local customs.

    3. Tone: Traditional, deeply respectful, professional, and knowledgeable.
    4. Format: Plain text, clear bullet points, no markdown bolding (e.g., use "1." instead of "**1.**"). 
    5. Language: English, but use traditional Sanskrit/Hindi terms where appropriate (Vidhi, Samagri, Darshan).
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "Could not generate details. Please type manually.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "The divine service is currently busy. Please type details manually.";
  }
};

/**
 * Uses Gemini Vision to compare a target photo against a database of candidates.
 */
export const findMatchingFace = async (targetBase64: string, candidates: {id: number, name: string, photo: string}[]) => {
  try {
    if (candidates.length === 0) return null;

    // Gemini 3 Flash has a large context window, so we can check more candidates.
    // Increasing limit to 50 recent candidates for better recall.
    const limitedCandidates = candidates.slice(0, 50);

    const prompt = `
    You are an expert in facial recognition. 
    I will provide a 'Target Face' image.
    Then I will provide a list of 'Candidate Face' images, each labeled with an ID and Name.
    
    TASK:
    Analyze facial features (eyes, nose, face shape, distinctive marks) to see if the Target Face matches any of the Candidates.
    Account for differences in lighting, camera angle, or age if the photos were taken at different times.
    
    Return ONLY the following JSON structure:
    { "matchFound": boolean, "matchedId": number | null, "confidence": number }
    Confidence should be between 0 and 1.
    `;

    // Construct multi-part request
    const parts: any[] = [{ text: prompt }];
    
    // Add Target
    parts.push({ text: "TARGET FACE IMAGE:" });
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: targetBase64.includes(',') ? targetBase64.split(',')[1] : targetBase64
      }
    });

    // Add Candidates
    parts.push({ text: "CANDIDATE DATABASE:" });
    limitedCandidates.forEach(c => {
      parts.push({ text: `CANDIDATE ID: ${c.id} (Name: ${c.name})` });
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: c.photo.includes(',') ? c.photo.split(',')[1] : c.photo
        }
      });
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matchFound: { type: Type.BOOLEAN },
            matchedId: { type: Type.INTEGER, nullable: true },
            confidence: { type: Type.NUMBER }
          },
          required: ["matchFound", "matchedId", "confidence"]
        }
      }
    });

    let resultText = response.text;
    if (!resultText) return null;

    // Sanitize response to ensure valid JSON (strip markdown code blocks if present)
    resultText = resultText.replace(/```json|```/g, '').trim();
    
    const result = JSON.parse(resultText);
    // Return ID only if confidence is high enough (e.g. > 0.6)
    return (result.matchFound && result.confidence > 0.6) ? result.matchedId : null;

  } catch (error) {
    console.error("Face Match Error:", error);
    return null;
  }
};
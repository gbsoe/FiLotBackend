import tesseract from "node-tesseract-ocr";

const config = {
  lang: "ind+eng",
  oem: 1,
  psm: 3,
};

export async function runOCR(localFilePath: string): Promise<string> {
  try {
    const text = await tesseract.recognize(localFilePath, config);
    return text;
  } catch (error) {
    console.error("OCR Error:", error);
    throw new Error("Failed to perform OCR");
  }
}

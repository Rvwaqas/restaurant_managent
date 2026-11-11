import fs from "fs";
import path from "path";
import { getStackConfig } from "./stack";

export interface PrintSlip {
  fileName: string;
  text: string;
  rawBytes: Buffer;
  isText: boolean;
}

export function getPrintSimDir(): string {
  try {
    const config = getStackConfig();
    return config.printSimFolder;
  } catch {
    return path.resolve(__dirname, "../../data/print_sim");
  }
}

export function listPrintSimSlips(): PrintSlip[] {
  const dir = getPrintSimDir();
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir);
  const textFiles = files.filter((f) => f.endsWith(".txt"));

  return textFiles.map((txtFile) => {
    const fullPath = path.join(dir, txtFile);
    const text = fs.readFileSync(fullPath, "utf-8");
    const binFile = txtFile.replace(/\.txt$/, ".bin");
    const binPath = path.join(dir, binFile);
    const rawBytes = fs.existsSync(binPath) ? fs.readFileSync(binPath) : Buffer.from(text, "utf-8");

    return {
      fileName: txtFile,
      text,
      rawBytes,
      isText: true,
    };
  });
}

export function clearPrintSimSlips(): void {
  const dir = getPrintSimDir();
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {}
  }
}


import { normalizePath, Plugin } from "obsidian";

import * as fs from "fs";
import fss from "fs/promises";
import { spawn } from "child_process";
import SummarPlugin from "./main";
import { SummarViewContainer, SummarDebug } from "./globals";

export class PdfToPng extends SummarViewContainer {
  private file: File;

  private tempDir: string;
  private pdfName: string;
  private outputDir: string;
  private page: number = 0; // Convert all pages

  private FORMAT: string = "png";
  private OUT_PREFIX = "page";
  private pdftocairoPath = "";

  /**
   * Initializes a new instance of the PdfToPng class.
   * @param resultContainer The container to display results.
   */
  constructor(plugin: SummarPlugin) {
    super(plugin);
    this.pdftocairoPath = normalizePath("/opt/homebrew/bin/pdftocairo");
  }

  async isPopplerInstalled(): Promise<boolean> {
    if (fs.existsSync(this.pdftocairoPath)) {
      SummarDebug.log(1, "Poppler is installed.");
      return true;
    } else {
      SummarDebug.log(1, "Poppler is not installed.");
      return false;
    }
  }

  async convert(file: any, removeflag: boolean): Promise<string[]> {
    this.file = file;
    this.page = 0; // initial value
    let result: string[] = [];

    SummarDebug.log(1, "Starting PDF to PNG conversion...");
    this.updateResultText("Initial rendering...");
    this.enableNewNote(false);

    // Save the PDF file to a temporary location
    this.tempDir = normalizePath((this.plugin.app.vault.adapter as any).basePath + "/" + (this.plugin as any).PLUGIN_DIR + "/pdf_converion/temp");
    this.pdfName = normalizePath(this.tempDir + "/" + this.file.name);

    if (!fs.existsSync(this.tempDir)) {
      await this.createDirectory(this.tempDir);
      SummarDebug.log(1, `Temporary directory created: ${this.tempDir}`);
      this.updateResultText(`Temporary directory created: ${this.tempDir}`);
      this.enableNewNote(false);
    } else {
      SummarDebug.log(1, `Temporary directory already exists: ${this.tempDir}`);
      this.updateResultText(`Temporary directory already exists: ${this.tempDir}`);
      this.enableNewNote(false);
    }

    SummarDebug.log(1, "PDF file will be save at:", this.pdfName);
    fs.writeFileSync(this.pdfName, Buffer.from(await this.file.arrayBuffer()));
    SummarDebug.log(1, "PDF file saved at:", this.pdfName);
    this.updateResultText(`PDF file saved at: ${this.pdfName}`);
    this.enableNewNote(false);

    // Output directory for PNGs
    const pdfName = this.file.name.replace(".pdf", "");
    this.outputDir = normalizePath(this.tempDir + "/" + pdfName);
    await this.createDirectory(this.outputDir);

    SummarDebug.log(1, "Converting PDF to images using Poppler...");
    this.updateResultText("Converting PDF to images using Poppler...");
    this.enableNewNote(false);

    SummarDebug.log(1, this.pdfName);

    await this.convertPdfToPng();//this.pdfName, options);
    if (removeflag) {
      await this.deleteIfExists(this.pdfName);
    }

    result = this.listPngFiles();
    SummarDebug.log(1, "outputDir: ", this.outputDir);

    if (removeflag) {
      await this.deleteIfExists(this.outputDir);
    }
    return result;
  }

  /**
  * Create a directory if it doesn't already exist.
  * @param path The path of the directory to create.
  */
  private async createDirectory(path: string): Promise<void> {
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, { recursive: true });
      SummarDebug.log(1, "Directory created:", path);
    } else {
      SummarDebug.log(1, "Directory already exists:", path);
    }
  }

  /**
   * Converts a PDF file to images using pdftocairo.
   */
  private async convertPdfToPng(): Promise<string[]> {
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Prepare arguments for pdftocairo
    const args = [
      `-${this.FORMAT}`, // Output format (e.g., -png)
      this.pdfName,    // Input PDF file
      normalizePath(this.outputDir + "/" + this.OUT_PREFIX), // Output file prefix
    ];

    // Add page-specific arguments
    if (this.page) {
      args.push("-f", String(this.page), "-l", String(this.page), "-r", String(300)); // Convert a specific page
    }

    SummarDebug.log(1, "Executing pdftocairo with args:", this.pdftocairoPath, args);

    return new Promise((resolve, reject) => {
      const process = spawn(this.pdftocairoPath, args);

      process.stdout.on("data", (data) => {
        SummarDebug.log(1, "stdout: ", data);
      });

      process.stderr.on("data", (data) => {
        SummarDebug.error(1,"stderr: ", data);

      });

      process.on("close", (code) => {
        if (code === 0) {
          SummarDebug.log(1, "PDF successfully converted.");
          const outputFiles = this.generateOutputFileList();
          resolve(outputFiles);
        } else {
          reject(new Error(`pdftocairo exited with code ${code}`));
        }
      });

      process.on("error", (error) => {
        reject(new Error(`Failed to start pdftocairo: ${error.message}\n\nThis plugin requires poppler. \nPlease install poppler using the following command in your shell: \n% brew install poppler.`));
      });
    });
  }

  async deleteIfExists(filePath: string): Promise<void> {
    try {
      const stats = await fss.stat(filePath); // 파일 또는 디렉토리 상태 확인

      if (stats.isFile()) {
        // 파일이면 삭제
        await fss.unlink(filePath);
        SummarDebug.log(1, `File deleted: ${filePath}`);
      } else if (stats.isDirectory()) {
        // 디렉토리이면 재귀적으로 삭제
        const files = await fss.readdir(filePath); // 디렉토리 내용 읽기
        for (const file of files) {
          const fullPath = `${filePath}/${file}`;
          await this.deleteIfExists(fullPath); // 재귀 호출
        }
        // 디렉토리 비워졌으므로 삭제
        await fss.rmdir(filePath);
        SummarDebug.log(1, `Directory deleted: ${filePath}`);
      } else {
        SummarDebug.error(1,`Unsupported file type: ${filePath}`);
      }
    } catch (err: any) {
      if (err.code === "ENOENT") {
        SummarDebug.error(1,`File or directory does not exist: ${filePath}`);
      } else if (err.code === "EACCES") {
        SummarDebug.error(1,`Permission denied to delete: ${filePath}`);
      } else {
        SummarDebug.error(1,`Failed to delete: ${filePath}`, err);
      }
    }
  }


  /**
   * Obsidian plugin-wide function to list and print PNG files matching "page-<number>.png".
   * This function is globally accessible within the plugin environment.
   * 
   * @returns A sorted array of matching PNG file names.
   */
  private listPngFiles(): string[] {
    const fs = require("fs");
    const path = require("path");

    try {
      // Ensure the directory exists
      if (!fs.existsSync(this.outputDir)) {
        SummarDebug.Notice(1, `Directory not found: ${this.outputDir}`,0);
        return [];
      }

      // Read and filter files matching "page-<number>.png"
      const files = fs.readdirSync(this.outputDir).filter((file: string) => {
        return file.startsWith("page-") && file.endsWith(".png");
      });

      // Sort files by numeric order of "page-<number>"
      const sortedFiles = files.sort((a: string, b: string) => {
        const numA = parseInt(a.split("-")[1].split(".")[0]);
        const numB = parseInt(b.split("-")[1].split(".")[0]);
        return numA - numB;
      });

      // Convert each file to Base64 and collect results
      const base64Values: string[] = [];
      sortedFiles.forEach((file: string) => {
        // const filePath = path.join(this.outputDir, file);
        const filePath = normalizePath(this.outputDir + "/" + file);
        try {
          const fileBuffer = fs.readFileSync(filePath); // Read file as buffer
          const base64String = fileBuffer.toString("base64"); // Convert to Base64
          base64Values.push(base64String); // Add Base64 to result
        } catch (readError) {
          SummarDebug.error(1,`Error reading file ${file}:`, readError);
          this.updateResultText(`Failed to process ${file}`);
          this.enableNewNote(false);
        }
      });
      return base64Values;
    } catch (error) {
      SummarDebug.error(1,"Error listing PNG files:", error);
      SummarDebug.Notice(1, "An error occurred while listing PNG files. Check the console for details.",0);
      return [];
    }
  }

  /**
  * Generates a list of output file names based on the output directory and prefix.
  * Assumes files follow the naming convention: prefix-1.png, prefix-2.png, etc.
  * @returns A list of output file paths.
  */
  generateOutputFileList(): string[] {
    const outputFiles: string[] = [];
    let page = 1;

    while (true) {
      const filePath = normalizePath(this.outputDir + "/" + `${this.OUT_PREFIX}-${page}.${this.FORMAT}`);
      if (fs.existsSync(filePath)) {
        outputFiles.push(filePath);
        page++;
      } else {
        break;
      }
    }
    return outputFiles;
  }

}


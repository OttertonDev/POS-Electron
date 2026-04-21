const fs = require("fs");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");

const OUTPUT_DIR = path.join(__dirname, "output");
const POWERSHELL_HELPER = path.join(__dirname, "windows-raw-spool.ps1");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function encodeThaiTis620(text) {
  const bytes = [];

  for (const char of String(text || "")) {
    const codePoint = char.codePointAt(0);

    if (codePoint === 0x0a) {
      bytes.push(0x0a);
      continue;
    }

    if (codePoint >= 0x20 && codePoint <= 0x7e) {
      bytes.push(codePoint);
      continue;
    }

    if (codePoint >= 0x0e01 && codePoint <= 0x0e3a) {
      bytes.push(codePoint - 0x0e01 + 0xa1);
      continue;
    }

    if (codePoint === 0x0e3f) {
      bytes.push(0xdf);
      continue;
    }

    if (codePoint >= 0x0e40 && codePoint <= 0x0e5b) {
      bytes.push(codePoint - 0x0e40 + 0xe0);
      continue;
    }

    bytes.push(0x3f);
  }

  return Buffer.from(bytes);
}

function toHex(buffer) {
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

function makeSampleLines() {
  return [
    "ทดสอบภาษาไทย",
    "สวัสดีครับ",
    "ชาไทย 55.00",
    "กาแฟเย็น 65.00",
    "รวม 120.00",
    "ขอบคุณที่ใช้บริการ"
  ];
}

function escPosTextLine(chunks, text) {
  chunks.push(encodeThaiTis620(text));
  chunks.push(Buffer.from([0x0a]));
}

function buildJob(codePage) {
  const chunks = [];
  const lines = makeSampleLines();

  chunks.push(Buffer.from([0x1b, 0x40]));
  chunks.push(Buffer.from([0x1b, 0x74, codePage]));
  chunks.push(Buffer.from([0x1b, 0x61, 0x01]));
  escPosTextLine(chunks, `THAI TEST PAGE ${codePage}`);
  chunks.push(Buffer.from([0x1b, 0x61, 0x00]));
  escPosTextLine(chunks, "------------------------------");

  for (const line of lines) {
    escPosTextLine(chunks, line);
  }

  escPosTextLine(chunks, "------------------------------");
  chunks.push(Buffer.from([0x1b, 0x64, 0x03]));
  chunks.push(Buffer.from([0x1d, 0x56, 0x00]));

  return {
    codePage,
    lines,
    buffer: Buffer.concat(chunks)
  };
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function writeJobToFile(job) {
  ensureOutputDir();
  const outputPath = path.join(OUTPUT_DIR, `thai-page-${job.codePage}.bin`);
  fs.writeFileSync(outputPath, job.buffer);
  return outputPath;
}

function sendToNetworkPrinter(job, host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port) || 9100 }, () => {
      socket.write(job.buffer);
      socket.end();
    });

    socket.on("close", () => resolve());
    socket.on("error", reject);
  });
}

function sendToWindowsPrinter(job, printerName) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        POWERSHELL_HELPER,
        "-PrinterName",
        printerName,
        "-JobName",
        `Thai Code Page ${job.codePage} Demo`,
        "-PayloadBase64",
        job.buffer.toString("base64")
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `PowerShell exited with code ${code}`));
    });
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const requestedPage = args.page ? [Number(args.page)] : [255, 96];
  const jobs = requestedPage.map((page) => buildJob(page));

  console.log("Thai print demo");
  console.log("Encoder: TIS-620 style single-byte mapping");
  console.log("Note: This is a best-effort encoder for printers that advertise Thai text pages.");
  console.log("");

  for (const job of jobs) {
    const outputPath = writeJobToFile(job);
    console.log(`Page ${job.codePage}`);
    console.log(`File: ${outputPath}`);
    console.log(`Bytes: ${job.buffer.length}`);
    console.log(`Hex preview: ${toHex(job.buffer.subarray(0, Math.min(80, job.buffer.length)))}`);
    console.log("");
  }

  if (args.host) {
    for (const job of jobs) {
      await sendToNetworkPrinter(job, args.host, args.port || 9100);
      console.log(`Sent page ${job.codePage} to network printer ${args.host}:${args.port || 9100}`);
    }
  }

  if (args.printer) {
    for (const job of jobs) {
      const result = await sendToWindowsPrinter(job, args.printer);
      console.log(`Sent page ${job.codePage} to Windows printer "${args.printer}"`);
      if (result) {
        console.log(result);
      }
    }
  }

  if (!args.host && !args.printer) {
    console.log("No printer target provided, so the demo only wrote .bin files.");
    console.log("Use one of these next:");
    console.log('  node demo/thai-print-demo.js --printer "Your Printer Name"');
    console.log("  node demo/thai-print-demo.js --host 192.168.1.50 --port 9100");
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

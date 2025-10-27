import express from "express";
import path from "path";
import fs from "fs";
import XLSX from "xlsx";

import expressFileUpload from "express-fileupload";

const data = fs.readFileSync("config/globalConfig.json", "utf-8");

const globalConfig = JSON.parse(data);

import {
  getObjFromProcessRow,
  getObjFromRow,
  isMissing,
  listFiles,
  PROCESS_TYPE,
  readXLSXFile,
} from "./util.js";
import { processing_script } from "./processing_scipt.js";

const app = express();
const rootDir = process.cwd();

app.use(express.static("public"));
app.use(expressFileUpload());

const moveFile = (file, dest) =>
  new Promise((resolve, reject) => {
    file.mv(dest, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

app.get("/download-processed-sheet/:folder", async (req, res) => {
  try {
    const folder = req.params.folder;
    const processedFile = path.join(
      rootDir,
      globalConfig.dataDir, // if globalConfig is a function
      folder,
      globalConfig.processedFile
    );

    if (!fs.existsSync(processedFile)) {
      return res.status(404).send("Processed file not found");
    }

    res.download(processedFile, (err) => {
      if (err) {
        console.error("Download error:", err);
        res.status(500).send("Error while downloading file");
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal server error");
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(rootDir, "public", "index.html"));
});

app.get("/get_metadata/:folder", (req, res) => {
  res.sendFile(path.join(rootDir, "public", "metadata.html"));
});

app.post("/fill_orders", async (req, res) => {
  let subDir = "";
  console.info("):- Got request to fill orders");

  try {
    const { xlsxFile, pdfFiles } = req.files;

    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const dirName = `${now.getFullYear()}_${
      now.getMonth() + 1
    }_${day}_${hours}_${minutes}_${seconds}`;

    // 1. Ensure __data folder exists
    const baseDir = path.join(rootDir, globalConfig.dataDir);
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir);

    // 2. Create subfolder
    subDir = path.join(baseDir, dirName);

    fs.mkdirSync(subDir);

    // 3. Save XLSX file
    const xlsxPath = path.join(subDir, globalConfig.excelFile);

    await moveFile(xlsxFile, xlsxPath);

    // 4. Save all PDFs
    if (Array.isArray(pdfFiles)) {
      for (const pdf of pdfFiles) {
        const pdfPath = path.join(subDir, pdf.name);
        await moveFile(pdf, pdfPath);
      }
    } else if (pdfFiles) {
      const pdfPath = path.join(subDir, pdfFiles.name);
      await moveFile(pdfFiles, pdfPath);
    }

    // await new Promise((resolve) => setTimeout(resolve, 10000));
    // 5. Read XLSX file
    const excelRows = readXLSXFile(xlsxPath);
    console.info(`:- Excel rows: ${excelRows.length}`);

    const orderRows = excelRows.map((excelRow) =>
      getObjFromRow(excelRow, {
        businessArea: globalConfig.businessArea,
        hsnSac: globalConfig.hsnSac,
        sac: globalConfig.sac,
      })
    );
    const validRows = orderRows.filter((row) => !isMissing(row));
    console.info(`:- Valid rows: ${validRows.length}`);

    if (validRows.length !== excelRows.length) {
      const invalidRows = orderRows.filter((row) => isMissing(row));
      console.info(`:- Invalid rows: ${invalidRows.length}`);
      throw new Error(
        `invalid rows found in excel file! \n\n Invalid rows: ${invalidRows
          .map((row) => row.orderNo)
          .join(", ")}`
      );
    }

    const existingFiles = validRows
      .map((o) => o.choosenFile)
      .filter((file) => fs.existsSync(path.join(subDir, file)));

    console.info(`:- Existing files: ${existingFiles.length}`);
    const files = await listFiles(subDir);

    if (existingFiles.length < validRows.length) {
      const missingFiles = validRows
        .map((o) => o.choosenFile)
        .filter((file) => !files.includes(file));
      console.info(`:- Missing files: ${missingFiles.length}`);
      throw new Error(
        `Error: ${
          missingFiles.length
        } file(s) not found in ${subDir}. \n\n${missingFiles.join(", ")}`
      );
    }

    const irns = validRows.map((p) => p["irnNo"]);
    const uniqueIrns = [...new Set(irns)];

    if (uniqueIrns.length != validRows.length) {
      throw new Error(
        `Error: ${validRows.length - uniqueIrns.length} duplicate irn(s) found.`
      );
    }

    const uniqueRowsByOrderNo = validRows.map((p) => p["orderNo"]);
    const uniqueOrderNo = [...new Set(uniqueRowsByOrderNo)];

    if (uniqueOrderNo.length != validRows.length) {
      throw new Error(
        `Error: ${
          validRows.length - uniqueOrderNo.length
        } duplicate order(s) found`
      );
    }
    const logs = [];
    try {
      processing_script(validRows, {
        subDir,
        processedFilePath: path.join(subDir, globalConfig.processedFile),
        username: globalConfig.username,
        password: globalConfig.password,
        logs,
      });
    } catch {}

    res.json({ status: "success", dirName });
  } catch (err) {
    console.log(`:- Error from ctrl catch block \n\n: ${err}`);
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/history", async (req, res) => {
  try {
    const baseDir = path.join(rootDir, globalConfig.dataDir);
    const dirs = await fs.promises.readdir(baseDir, { withFileTypes: true });

    const allDirs = [];
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;

      const processedFile = path.join(
        baseDir,
        dir.name,
        globalConfig.processedFile
      );
      const excelFile = path.join(baseDir, dir.name, globalConfig.excelFile);
      try {
        const processedData = readXLSXFile(processedFile);
        const ordersData = readXLSXFile(excelFile);

        allDirs.push({
          dirName: dir.name,
          processedData: processedData.map((o) => getObjFromProcessRow(o)),
          ordersData: ordersData.map((o) =>
            getObjFromRow(o, {
              businessArea: globalConfig.businessArea,
              hsnSac: globalConfig.hsnSac,
              sac: globalConfig.sac,
            })
          ),
        });
      } catch {
        // skip folders without processed.xlsx
      }
    }

    const historyTableData = allDirs.map((dir) => {
      const processedData = dir.processedData;
      const ordersData = dir.ordersData;
      const processed = ordersData
        .filter(
          (row) =>
            processedData
              .filter((p) => p.orderNo == row.orderNo)
              .filter((p) => p.status == PROCESS_TYPE.PROCESSED).length > 0
        )
        .map((o) => processedData.find((p) => p.orderNo === o.orderNo));

      const unprocessed = ordersData
        .filter(
          (row) =>
            !processed.find((o) => o.orderNo == row.orderNo) &&
            processedData
              .filter((p) => p.orderNo == row.orderNo)
              .filter((p) => p.status == PROCESS_TYPE.NOT_PROCESSED).length > 0
        )
        .map((o) => processedData.find((p) => p.orderNo == o.orderNo));

      const processedSuccess = processed.filter(
        (row) => row.success === "TRUE"
      ).length;

      const processedFailure = processed.filter(
        (row) => row.success === "FALSE"
      ).length;

      // Format timestamp to be more human-readable
      const [year, month, day, hour, minute, second] = dir.dirName.split("_");
      const date = new Date(
        `${year}-${month.padStart(2, "0")}-${day.padStart(
          2,
          "0"
        )}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${(
          second || "00"
        ).padStart(2, "0")}`
      );

      const formattedDate = date.toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });

      const label = formattedDate;

      return {
        label,
        id: dir.dirName,
        totalOrder: ordersData.length,
        processed: processed.length,
        unprocessed: unprocessed.length,
        processedSuccess,
        processedFailure,
      };
    });
    return res.json(historyTableData);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error reading history");
  }
});

app.post("/fill_unprocessed/:folder", async (req, res) => {
  try {
    const folder = req.params.folder;

    const processedData = readXLSXFile(
      path.join(
        rootDir,
        globalConfig.dataDir,
        folder,
        globalConfig.processedFile
      )
    );
    const ordersData = readXLSXFile(
      path.join(rootDir, globalConfig.dataDir, folder, globalConfig.excelFile)
    ).map((o) =>
      getObjFromRow(o, {
        businessArea: globalConfig.businessArea,
        hsnSac: globalConfig.hsnSac,
        sac: globalConfig.sac,
      })
    );

    const processed = ordersData
      .filter(
        (row) =>
          processedData
            .filter((p) => p.orderNo == row.orderNo)
            .filter((p) => p.status == PROCESS_TYPE.PROCESSED).length > 0
      )
      .map((o) => processedData.find((p) => p.orderNo === o.orderNo));

    const unprocessed = ordersData.filter(
      (row) =>
        !processed.find((o) => o.orderNo == row.orderNo) &&
        processedData
          .filter((p) => p.orderNo == row.orderNo)
          .filter((p) => p.status == PROCESS_TYPE.NOT_PROCESSED).length > 0
    );
    try {
      processing_script(unprocessed, {
        subDir: path.join(rootDir, globalConfig.dataDir, folder),
        processedFilePath: path.join(
          rootDir,
          globalConfig.dataDir,
          folder,
          globalConfig.processedFile
        ),
        username: globalConfig.username,
        password: globalConfig.password,
        logs: [],
      });
    } catch (error) {}

    res.send("Success");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error reading history");
  }
});

app.get("/get_metadata_api/:folder", async (req, res) => {
  try {
    const folder = req.params.folder;
    const processedData = readXLSXFile(
      path.join(
        rootDir,
        globalConfig.dataDir,
        folder,
        globalConfig.processedFile
      )
    );
    // ✅ sort data: group by orderNo, then sort by status & timestamp
    const grouped = processedData.reduce((acc, row) => {
      acc[row.orderNo] = acc[row.orderNo] || [];
      acc[row.orderNo].push(row);
      return acc;
    }, {});

    Object.values(grouped).forEach((group) => {
      group.sort((a, b) => {
        if (a.status === b.status)
          return new Date(a.timestamp) - new Date(b.timestamp);
        return a.status === "NOT_PROCESSED" ? -1 : 1;
      });
    });

    const sorted = Object.values(grouped)
      .flat()
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.json(sorted);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error reading metadata");
  }
});

// Get current global configuration
app.get("/api/global-config", (req, res) => {
  try {
    res.json({
      businessArea: globalConfig.businessArea,
      hsnSac: globalConfig.hsnSac,
      sac: globalConfig.sac,
      username: globalConfig.username,
      password: globalConfig.password,
    });
  } catch (error) {
    console.error("Error getting config:", error);
    res.status(500).json({ error: "Failed to load configuration" });
  }
});

// Update global configuration
app.put("/api/change-global-config", express.json(), async (req, res) => {
  const filePath = path.join(rootDir, "config", "globalConfig.json");
  try {
    console.log("req.body: ", req.body);
    const { businessArea, hsnSac, sac, username, password } = req.body;

    const data = await fs.promises.readFile(filePath, "utf-8");
    const json = JSON.parse(data);

    // Replace the value
    json["businessArea"] = businessArea || globalConfig.businessArea;
    json["hsnSac"] = hsnSac || globalConfig.hsnSac;
    json["sac"] = sac || globalConfig.sac;
    json["username"] = username || globalConfig.username;
    json["password"] = password || globalConfig.password;

    await fs.promises.writeFile(
      filePath,
      JSON.stringify(json, null, 2),
      "utf-8"
    );

    globalConfig.businessArea = businessArea || globalConfig.businessArea;
    globalConfig.hsnSac = hsnSac || globalConfig.hsnSac;
    globalConfig.sac = sac || globalConfig.sac;
    globalConfig.username = username || globalConfig.username;
    globalConfig.password = password || globalConfig.password;

    res.send("Success");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error reading history");
  }
});
app.listen(5555, () => console.log("Server running on port 5555"));

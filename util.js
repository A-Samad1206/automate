import XLSX from "xlsx";

import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";

export const PROCESS_TYPE = {
  PROCESSED: "PROCESSED",
  NOT_PROCESSED: "NOT_PROCESSED",
};

export const getObjFromProcessRow = (o) => {
  return {
    orderNo: o.orderNo,
    message: o.message,
    status: o.status,
    timestamp: o.timestamp,
    success: o.success,
    url: o.url,
    errors: o.errors,
  };
};

export const listFiles = async (dirPath) => {
  const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dirPath, entry.name));
  return files;
};

export const getObjFromRow = (
  row,
  { businessArea: _businessArea, hsnSac: _hsnSac, sac: _sac }
) => {
  const orderNo = row["Order no"];
  const invoiceNo = row["HFS Invoice No"];
  // const invoiceDate = row["HFS Invoice Date"];
  const irnNo = row["IRN NO"];
  const totalInvoiceBaseAmount =
    typeof row["Total Invoice Base Amount"] === "string"
      ? parseFloat(row["Total Invoice Base Amount"].split(",").join(""))
      : row["Total Invoice Base Amount"];
  // console.log("invoiceDate:", invoiceDate);
  // const spliited = invoiceDate.split("/");
  // console.log("spliited:", spliited);
  const businessArea = _businessArea;
  const hsnSac = _hsnSac;
  const sac = _sac;

  const choosenFile = row["HFS Invoice No"];
  const day = row['Day'];
  const month = row['Month']
  const year = row['Year']

  return {
    orderNo,
    invoiceNo,
    invoiceDate: [month,day,year].join("/"),
    irnNo,
    businessArea,
    totalInvoiceBaseAmount,
    hsnSac,
    sac,
    choosenFile: `${choosenFile}.pdf`,
  };
};

export const isMissing = (row) => {
  return (
    !row.orderNo ||
    !row.invoiceNo ||
    !row.invoiceDate ||
    !row.irnNo ||
    !row.businessArea ||
    !row.totalInvoiceBaseAmount ||
    !row.hsnSac ||
    !row.sac ||
    !row.choosenFile
  );
};

export const readXLSXFile = (filePath) => {
  try {
    const workbook = XLSX.readFile(filePath, {
      cellText: false,
      cellDates: true,
      rawNumbers: false,
    });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, {
      raw: false, // Converts everything to text form
      defval: "", // Default empty string for empty cells
    });
    return data;
  } catch (error) {
    throw new Error("invalid data in excel file!");
  }
};

export const getPendingRows = (rows, filePath) => {
  try {
    const processed_rows = readXLSXFile(filePath)
      .map((o) => getObjFromProcessRow(o))
      .filter((o) => o.status === PROCESS_TYPE.PROCESSED)
      .map((o) => o.orderNo);

    return rows.filter((r) => !processed_rows.includes(r.orderNo));
  } catch (error) {
    console.error("Error fetching processed rows", error);
    return rows;
  }
};

export async function writeOrAppendXLSX(filePath, data) {
  const sheetName = "Sheet1";
  let workbook, worksheet;

  // Check if file exists using fs.promises
  try {
    await fs.promises.access(filePath);
    // File exists, read it
    const buffer = await fs.promises.readFile(filePath);
    workbook = XLSX.read(buffer, { type: "buffer" });
    worksheet = workbook.Sheets[sheetName] || XLSX.utils.json_to_sheet([]);
    const existingData = XLSX.utils.sheet_to_json(worksheet);
    const newData = [...existingData, ...data];
    worksheet = XLSX.utils.json_to_sheet(newData);
  } catch (error) {
    // File doesn't exist or other error, create new workbook
    if (error.code === "ENOENT") {
      workbook = XLSX.utils.book_new();
      worksheet = XLSX.utils.json_to_sheet(data || []);
    } else {
      throw error;
    }
  }

  // Remove existing sheet if it exists to avoid duplicate sheet names
  if (workbook.SheetNames.includes(sheetName)) {
    const sheetIndex = workbook.SheetNames.indexOf(sheetName);
    workbook.SheetNames.splice(sheetIndex, 1);
    delete workbook.Sheets[sheetName];
  }

  // Add the worksheet to the workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Write the workbook
  const outBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  await fs.promises.writeFile(filePath, outBuffer);
}

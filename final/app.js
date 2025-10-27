import { writeOrAppendXLSX } from "./util.js";

writeOrAppendXLSX("./test.xlsx", [
  {
    orderNo: "123",
    message: "test",
    status: "success",
    timestamp: new Date().toISOString(),
    success: true,
  },
]);

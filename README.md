## Guide to use this Automation

1. Update the config.js file with the required values

2. CSV file must have these columns with exact name

   - Order no
   - HFS Invoice No
   - HFS Invoice Date
   - IRN NO
   - Business Area(optional)
   - Total Invoice Base Amount
   - HSN/SAC(optional)
   - SAC(optional)
   - HFS Invoice No

3. We expect the pdf (only) files to be in the pdfDir folder with the name as HFS Invoice No + .pdf

4. Run the automate_script.js file

5. The processed order will be saved in the processedOrderFile

---

1. User visit localhost:3000

2. List all the process so far been executed with metadata like no of order needs to be processed, failed and reasons. Reprocess remaining failed/status false orders.

3. Presented with a screen where he/she can upload the xlsx document containing the tables to be processed, username and password and pdf files.

- If any order in crt data exist earlier can notify the user as well.

4. Give that process a name equal to that Mo_Da_Ho_Mi_Ss

5. Create directory in the automate_data dir with Mo_Da_Ho_Mi_Ss and store the uploaded doc in that.

6. Store the entire ops result in Mo_Da_Ho_Mi_Ss_result.xlsx

7. Endpoint to list all the process so far been executed with metadata like no of order needs to be processed, failed and reasons. Reprocess remaining failed/status false orders.

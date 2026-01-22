async function main(workbook: ExcelScript.Workbook) {
    // 1. 設定項目
    const url = "https://get-log.25f0qwsr2onp.us-south.codeengine.appdomain.cloud/";
    const sheetName = "ログ";

    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
        // console.error ではなく console.log を使用します
        console.log(`${sheetName} シートが見つかりません。シート名を確認してください。`);
        return;
    }

    // 2. Code Engine から CSV データを取得
    console.log("Code Engine からデータを取得中...");
    try {
        const response = await fetch(url);

        if (!response.ok) {
            console.log("データの取得に失敗しました。ステータス: " + response.status);
            return;
        }

        const csvText = await response.text();

        // 3. CSV 解析 (引用符内の改行を保持するロジック)
        const rows: string[][] = [];
        let currentRow: string[] = [];
        let currentValue = "";
        let inQuotes = false;

        for (let i = 0; i < csvText.length; i++) {
            let char = csvText[i];
            let nextChar = csvText[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    currentValue += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                currentRow.push(currentValue);
                currentValue = "";
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                if (char === '\r' && nextChar === '\n') i++;
                currentRow.push(currentValue);
                rows.push(currentRow);
                currentRow = [];
                currentValue = "";
            } else {
                currentValue += char;
            }
        }
        if (currentRow.length > 0 || currentValue !== "") {
            currentRow.push(currentValue);
            rows.push(currentRow);
        }

        // 4. シートへの書き込み
        sheet.getUsedRange()?.clear();
        if (rows.length > 0) {
            const range = sheet.getRangeByIndexes(0, 0, rows.length, rows[0].length);
            range.setValues(rows);

            range.getFormat().setWrapText(true);
            range.getFormat().setVerticalAlignment(ExcelScript.VerticalAlignment.top);
            sheet.getUsedRange().getFormat().autofitColumns();
        }

        console.log("更新が正常に完了しました！");

    } catch (error) {
        console.log("実行中にエラーが発生しました: " + error);
    }
}
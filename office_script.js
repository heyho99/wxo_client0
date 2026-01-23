async function main(workbook: ExcelScript.Workbook) {
    const url = "https://get-log.25f0qwsr2onp.us-south.codeengine.appdomain.cloud/";
    const sheetName = "ログ";
    const sheet = workbook.getWorksheet(sheetName) || workbook.addWorksheet(sheetName);

    console.log("データを取得して加工中...");
    try {
        const res = await fetch(url);
        const text = await res.text();

        // 1. CSV 解析 (既存のロジック)
        let rows: string[][] = [];
        let curRow: string[] = [], val = "", q = false;
        for (let i = 0; i < text.length; i++) {
            let c = text[i], n = text[i + 1];
            if (c === '"') { if (q && n === '"') { val += '"'; i++; } else q = !q; }
            else if (c === ',' && !q) { curRow.push(val); val = ""; }
            else if ((c === '\n' || c === '\r') && !q) { if (c === '\r' && n === '\n') i++; curRow.push(val); rows.push(curRow); curRow = []; val = ""; }
            else val += c;
        }
        if (val || curRow.length > 0) { curRow.push(val); rows.push(curRow); }

        // --- 2. スクリプト側でヘッダーを強制挿入 ---
        // Python がヘッダーを返さない前提で、配列の先頭に見出しを追加します
        const headerNames = ["ID", "GAROON_ID", "氏名", "TIMESTAMP", "質問内容", "回答内容", "評価", "カテゴリ", "詳細テキスト"];
        rows.unshift(headerNames);

        // 3. シートのクリアと書き込み
        if (sheet.getAutoFilter()) { sheet.getAutoFilter().remove(); }
        sheet.getUsedRange()?.clear();

        const rowCount = rows.length;
        const colCount = rows[0].length;
        const range = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
        range.setValues(rows);

        // --- 4. 見た目の整形 ---
        // ヘッダー行 (1行目) を装飾
        const headerRange = range.getRow(0);
        headerRange.getFormat().getFont().setBold(true);
        headerRange.getFormat().getFill().setColor("#D9D9D9");

        // フィルタを適用
        sheet.getAutoFilter().apply(range);

        // --- 5. TIMESTAMP 列 (D列 / インデックス 3) の全文表示 ---
        // 固定で「4番目の列 (インデックス3)」を日時形式に設定します
        const tsColIndex = 3;
        if (rowCount > 1) {
            const tsDataRange = range.getColumn(tsColIndex).getOffsetRange(1, 0).getResizedRange(rowCount - 2, 0);
            tsDataRange.setNumberFormatLocal("yyyy-mm-dd hh:mm:ss");
        }

        // 全体の整形
        range.getFormat().setVerticalAlignment(ExcelScript.VerticalAlignment.top);
        range.getFormat().setWrapText(true);
        sheet.getUsedRange().getFormat().autofitColumns();

        console.log("ヘッダー合成と書式設定が完了しました！");

    } catch (e) {
        console.log("エラー: " + e);
    }
}
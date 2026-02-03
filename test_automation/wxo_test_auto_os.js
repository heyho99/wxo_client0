/**
 * WXO Test Automation - Office Script
 * 
 * このスクリプトはExcel上で動作し、
 * A列から質問を読み取り、Code Engineエンドポイントに送信し、
 * 結果をB列（Answer）、C列（Status）に書き込みます。
 * 
 * 使用方法:
 * 1. Excel for the Webでシートを開く
 * 2. A1に"Question"ヘッダー、A2以降に質問を入力
 * 3. このスクリプトを実行
 * 4. B列に回答、C列にステータスが出力される
 */

async function main(workbook: ExcelScript.Workbook) {
    // ===============================================================
    // 設定
    // ===============================================================

    // Code Engine Function のエンドポイント
    // ※デプロイ後に実際のURLに置き換えてください
    const CODE_ENGINE_URL = "https://your-code-engine-function.us-south.codeengine.appdomain.cloud/";

    // WXO Agent ID
    // ※使用するエージェントのIDに置き換えてください
    const WXO_AGENT_ID = "27e6dff3-4f30-42d4-b49a-d5c697328009";

    // シート設定
    const sheetName = "Sheet1"; // 対象シート名
    const startRowIndex = 1;    // データ開始行 (0-indexed, 行2から)
    const questionColIndex = 0; // A列
    const answerColIndex = 1;   // B列
    const statusColIndex = 2;   // C列

    // ===============================================================
    // シートの取得と初期化
    // ===============================================================

    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
        console.log(`シート "${sheetName}" が見つかりません。`);
        return;
    }

    // ヘッダー設定
    const headerRange = sheet.getRange("A1:C1");
    headerRange.setValues([["Question", "Answer", "Status"]]);

    // ヘッダーのフォーマット（太字、背景色）
    const headerFormat = headerRange.getFormat();
    headerFormat.getFill().setColor("D9D9D9");
    headerFormat.getFont().setBold(true);

    const usedRange = sheet.getUsedRange();
    if (!usedRange) {
        console.log("シートにデータがありません（ヘッダーのみ）。");
        return;
    }

    // オートフィルター適用
    sheet.getAutoFilter().apply(usedRange);

    const values = usedRange.getValues();
    const rowCount = values.length;

    console.log(`${rowCount} 行見つかりました。`);

    // ===============================================================
    // 質問の収集
    // ===============================================================

    const questions: string[] = [];
    const questionRows: number[] = []; // 質問がある行のインデックスを記録

    for (let i = startRowIndex; i < rowCount; i++) {
        const question = String(values[i][questionColIndex] || "").trim();
        if (question) {
            questions.push(question);
            questionRows.push(i);
        }
    }

    if (questions.length === 0) {
        console.log("質問が見つかりませんでした。");
        return;
    }

    console.log(`${questions.length} 件の質問を処理します...`);

    // ===============================================================
    // Code Engine に送信
    // ===============================================================

    try {
        // 処理中ステータスを設定
        for (const rowIdx of questionRows) {
            sheet.getCell(rowIdx, statusColIndex).setValue("Processing...");
        }

        const response = await fetch(CODE_ENGINE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ agent_id: WXO_AGENT_ID, questions: questions })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`エラー: ${response.status} - ${errorText}`);
            for (const rowIdx of questionRows) {
                sheet.getCell(rowIdx, statusColIndex).setValue(`Error: ${response.status}`);
            }
            return;
        }

        // CSVレスポンスの取得
        const csvText = await response.text();

        // CSVのパース
        const results = parseCSV(csvText);

        console.log(`${results.length} 件の結果を受信しました。`);

        // ===============================================================
        // 結果をExcelに書き込み
        // ===============================================================

        for (let i = 0; i < results.length && i < questionRows.length; i++) {
            const result = results[i];
            const rowIdx = questionRows[i];

            sheet.getCell(rowIdx, answerColIndex).setValue(result.Answer || "");
            sheet.getCell(rowIdx, statusColIndex).setValue(result.Status || "");
        }

        console.log("完了しました！");

    } catch (error) {
        console.log(`通信エラー: ${error}`);
        for (const rowIdx of questionRows) {
            sheet.getCell(rowIdx, statusColIndex).setValue(`Error: ${error}`);
        }
    }
}

/**
 * CSVテキストをパースして配列に変換します。
 * ダブルクォートで囲まれたフィールド内の改行に対応しています。
 */
function parseCSV(csvText: string): Array<{ Question: string; Answer: string; Status: string }> {
    const results: Array<{ Question: string; Answer: string; Status: string }> = [];

    // BOMを除去
    if (csvText.charCodeAt(0) === 0xFEFF) {
        csvText = csvText.substring(1);
    }

    // CSVパース（ダブルクォート内の改行に対応）
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = "";
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];

        if (inQuotes) {
            if (char === '"') {
                if (nextChar === '"') {
                    // エスケープされたダブルクォート
                    currentField += '"';
                    i++; // 次の文字をスキップ
                } else {
                    // クォート終了
                    inQuotes = false;
                }
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentRow.push(currentField);
                currentField = "";
            } else if (char === '\r' && nextChar === '\n') {
                currentRow.push(currentField);
                currentField = "";
                rows.push(currentRow);
                currentRow = [];
                i++; // \n をスキップ
            } else if (char === '\n') {
                currentRow.push(currentField);
                currentField = "";
                rows.push(currentRow);
                currentRow = [];
            } else {
                currentField += char;
            }
        }
    }

    // 最後のフィールドと行を追加
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }

    // ヘッダー行をスキップしてデータを取得
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length >= 3) {
            results.push({
                Question: row[0] || "",
                Answer: row[1] || "",
                Status: row[2] || ""
            });
        }
    }

    return results;
}

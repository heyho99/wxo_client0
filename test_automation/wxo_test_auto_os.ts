/**
 * WXO Test Automation v2 - Office Script
 * 
 * このスクリプトはExcel上で動作し、
 * 「設定」シートから設定と質問データを読み込み、
 * 「出力」シートに結果を出力します。
 * 
 * 設定シート構成:
 *   A1: "CODE_ENGINE_URL"    B1: [エンドポイントURL]
 *   A2: "AGENT_ID"           B2: [エージェントID]
 *   A3: (空行)
 *   A4: "質問" | "模範解答" | "必須単語1" | "必須単語2" | "必須単語3"  ← ヘッダー
 *   A5~: [質問データ]
 * 
 * 出力シート構成 (自動生成):
 *   A列: 質問
 *   B列: 模範解答
 *   C列: WXO回答
 *   D列: 必須単語1
 *   E列: 必須単語2
 *   F列: 必須単語3
 *   G列: 検索結果 [〇,×,-]
 */

async function main(workbook: ExcelScript.Workbook) {
    // ===============================================================
    // シート名の設定
    // ===============================================================
    const settingsSheetName = "設定";
    const outputSheetName = "出力";

    // ===============================================================
    // 設定シートの読み込み
    // ===============================================================
    const settingsSheet = workbook.getWorksheet(settingsSheetName);
    if (!settingsSheet) {
        console.log(`エラー: シート「${settingsSheetName}」が見つかりません。`);
        return;
    }

    // 設定値の取得 (B1: URL, B2: Agent ID)
    const codeEngineUrl = String(settingsSheet.getRange("B1").getValue() || "").trim();
    const agentId = String(settingsSheet.getRange("B2").getValue() || "").trim();

    if (!codeEngineUrl) {
        console.log("エラー: CODE_ENGINE_URL が設定されていません (設定シート B1)。");
        return;
    }
    if (!agentId) {
        console.log("エラー: AGENT_ID が設定されていません (設定シート B2)。");
        return;
    }

    console.log(`CODE_ENGINE_URL: ${codeEngineUrl}`);
    console.log(`AGENT_ID: ${agentId}`);

    // ===============================================================
    // 設定シートから質問データを読み込み (A5から開始)
    // ===============================================================
    const settingsUsedRange = settingsSheet.getUsedRange();
    if (!settingsUsedRange) {
        console.log("設定シートにデータがありません。");
        return;
    }

    const settingsValues = settingsUsedRange.getValues();
    const settingsRowCount = settingsValues.length;

    interface QuestionData {
        question: string;
        modelAnswer: string;
        keyword1: string;
        keyword2: string;
        keyword3: string;
    }

    const questionDataList: QuestionData[] = [];
    const dataStartRow = 4; // 行5から（0-indexed = 4）

    for (let i = dataStartRow; i < settingsRowCount; i++) {
        const question = String(settingsValues[i][0] || "").trim();
        if (question) {
            questionDataList.push({
                question: question,
                modelAnswer: String(settingsValues[i][1] || "").trim(),
                keyword1: String(settingsValues[i][2] || "").trim(),
                keyword2: String(settingsValues[i][3] || "").trim(),
                keyword3: String(settingsValues[i][4] || "").trim()
            });
        }
    }

    if (questionDataList.length === 0) {
        console.log("設定シートに質問が見つかりませんでした（A5以降を確認してください）。");
        return;
    }

    console.log(`${questionDataList.length} 件の質問を処理します...`);

    // ===============================================================
    // 出力シートの準備
    // ===============================================================
    let outputSheet = workbook.getWorksheet(outputSheetName);
    if (!outputSheet) {
        outputSheet = workbook.addWorksheet(outputSheetName);
        console.log(`シート「${outputSheetName}」を作成しました。`);
    }

    // 出力シートをクリア
    outputSheet.getUsedRange()?.clear();

    // ヘッダー設定
    const headerRange = outputSheet.getRange("A1:G1");
    headerRange.setValues([["質問", "模範解答", "WXO回答", "必須単語1", "必須単語2", "必須単語3", "検索結果"]]);
    const headerFormat = headerRange.getFormat();
    headerFormat.getFill().setColor("D9D9D9");
    headerFormat.getFont().setBold(true);

    // 処理中ステータスを設定
    for (let i = 0; i < questionDataList.length; i++) {
        const qd = questionDataList[i];
        const rowIdx = i + 1; // 行2から
        outputSheet.getCell(rowIdx, 0).setValue(qd.question);
        outputSheet.getCell(rowIdx, 1).setValue(qd.modelAnswer);
        outputSheet.getCell(rowIdx, 2).setValue("処理中...");
        outputSheet.getCell(rowIdx, 3).setValue(qd.keyword1);
        outputSheet.getCell(rowIdx, 4).setValue(qd.keyword2);
        outputSheet.getCell(rowIdx, 5).setValue(qd.keyword3);
        outputSheet.getCell(rowIdx, 6).setValue("");
    }

    // ===============================================================
    // Code Engine に送信
    // ===============================================================
    try {
        const questions = questionDataList.map(qd => qd.question);

        const response = await fetch(codeEngineUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ agent_id: agentId, questions: questions })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`エラー: ${response.status} - ${errorText}`);
            for (let i = 0; i < questionDataList.length; i++) {
                outputSheet.getCell(i + 1, 2).setValue(`Error: ${response.status}`);
            }
            return;
        }

        // CSVレスポンスの取得
        const csvText = await response.text();
        const results = parseCSV(csvText);

        console.log(`${results.length} 件の結果を受信しました。`);

        // ===============================================================
        // 結果をExcelに書き込み
        // ===============================================================
        for (let i = 0; i < results.length && i < questionDataList.length; i++) {
            const result = results[i];
            const qd = questionDataList[i];
            const rowIdx = i + 1;
            const wxoAnswer = result.Answer || "";

            // WXO回答を書き込み (C列)
            outputSheet.getCell(rowIdx, 2).setValue(wxoAnswer);

            // 必須単語検索の実行
            const searchResults: string[] = [];
            const keywords = [qd.keyword1, qd.keyword2, qd.keyword3];

            for (const keyword of keywords) {
                if (!keyword) {
                    searchResults.push("-");
                } else if (wxoAnswer.includes(keyword)) {
                    searchResults.push("〇");
                } else {
                    searchResults.push("×");
                }
            }

            // 検索結果を書き込み (G列)
            outputSheet.getCell(rowIdx, 6).setValue(searchResults.join(","));
        }

        // オートフィルター適用
        const outputUsedRange = outputSheet.getUsedRange();
        if (outputUsedRange) {
            outputSheet.getAutoFilter().apply(outputUsedRange);
        }

        console.log("完了しました！");

    } catch (error) {
        console.log(`通信エラー: ${error}`);
        for (let i = 0; i < questionDataList.length; i++) {
            outputSheet.getCell(i + 1, 2).setValue(`Error: ${error}`);
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
                    currentField += '"';
                    i++;
                } else {
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
                i++;
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

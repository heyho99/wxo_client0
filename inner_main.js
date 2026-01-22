/**
 * Code Engine Function: 超堅牢版
 * (環境変数チェック・時刻自動生成・デバッグログ完備)
 */
async function main(params) {
    // 1. ボディの取得と安全なパース
    let data = params || {};
    if (params && params.__ce_body) {
        try {
            data = (typeof params.__ce_body === 'string') ? JSON.parse(params.__ce_body) : params.__ce_body;
        } catch (e) {
            console.error("JSONパース失敗:", e.message);
        }
    }

    // 2. 環境変数の取得 (未定義でもエラーにならないよう空文字で保護)
    const HOSTNAME = (process.env.DB2_HOSTNAME || "").trim();
    const USERID = (process.env.DB2_USERID || "").trim();
    const PASSWORD = (process.env.DB2_PASSWORD || process.env.PASSWORD || "").trim();
    const DEPLOYMENT_ID = (process.env.DB2_DEPLOYMENT_ID || "").trim();

    // 必須変数が欠けている場合は 500 を返して詳細をログに出す
    if (!HOSTNAME || !USERID || !PASSWORD) {
        console.error("【エラー】環境変数が未設定です。DB2_HOSTNAME, USERID, PASSWORD を確認してください。");
        return { statusCode: 500, body: { error: "Missing environment variables" } };
    }

    const baseUrl = `https://${HOSTNAME}/dbapi/v4`;

    try {
        console.log("1. トークンを取得中...");
        const tokenResponse = await fetch(`${baseUrl}/auth/tokens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-deployment-id': DEPLOYMENT_ID },
            body: JSON.stringify({ userid: USERID, password: PASSWORD })
        });

        if (!tokenResponse.ok) {
            const errText = await tokenResponse.text();
            throw new Error(`認証失敗: ${tokenResponse.status} ${errText}`);
        }
        const { token } = await tokenResponse.json();

        // 3. 時刻の自動生成 (常に現在時刻を使用)
        const now = new Date();
        const db2Timestamp = now.toISOString().replace('T', ' ').replace('Z', '').substring(0, 23);
        console.log("2. 時刻生成完了:", db2Timestamp);

        // 4. SQL構築 (各値が欠けていても空文字で補完して SQL エラーを防ぐ)
        const sqlCommand = `INSERT INTO "CLD47628"."WXO_LOG" ("id", "garoonId", "name", "timestamp", "question", "answer", "isPositive", "categories", "text") VALUES ('${data.id || ""}', '${data.garoonId || ""}', '${data.name || ""}', '${db2Timestamp}', '${data.question || ""}', '${data.answer || ""}', ${data.isPositive || 0}, '${data.categories || ""}', '${data.text || ""}');`;

        console.log("3. SQLジョブ投入中...");
        const submitResponse = await fetch(`${baseUrl}/sql_jobs`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'x-deployment-id': DEPLOYMENT_ID },
            body: JSON.stringify({ commands: sqlCommand, limit: 1, separator: ";", stop_on_error: "yes" })
        });
        const jobInfo = await submitResponse.json();
        const jobId = jobInfo.id;
        console.log("   -> Job ID:", jobId);

        // 5. 完了待機
        let finalResult = null;
        for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const checkResponse = await fetch(`${baseUrl}/sql_jobs/${jobId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'x-deployment-id': DEPLOYMENT_ID }
            });
            finalResult = await checkResponse.json();
            if (finalResult.status === "completed") break;
        }

        const sqlError = finalResult.results?.[0]?.error;
        if (sqlError) {
            console.error("【DB2実行エラー】:", sqlError);
            return { statusCode: 500, body: { error: sqlError, jobId: jobId } };
        }

        console.log("【成功】書き込みが完了しました。");
        return {
            statusCode: 201,
            headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
            body: { message: "Successfully inserted", timestamp: db2Timestamp, jobId: jobId }
        };

    } catch (error) {
        console.error("【実行エラー】:", error.message);
        return { statusCode: 500, body: { error: error.message } };
    }
}

module.exports.main = main;

// --- ローカルデバッグ用ブロック ---
if (require.main === module) {
    require('dotenv').config();
    const testId = "LOCAL-" + Date.now();
    console.log("--- ローカルテスト開始 ---");
    main({ id: testId, garoonId: "G-LOCAL", name: "Tester", question: "テスト", answer: "成功", isPositive: 1, categories: "DEBUG", text: "Checking logs..." })
        .then(res => console.log("--- 最終結果 ---\n", JSON.stringify(res, null, 2)))
        .catch(err => console.error("致命的なエラー:", err));
}
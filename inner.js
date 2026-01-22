/**
 * Code Engine Function: 標準 fetch を使用した DB2 INSERT プロキシ
 */
async function main(params) {
    const data = params.__ce_body || params;
    const HOSTNAME = process.env.DB2_HOSTNAME;
    const USERID = process.env.DB2_USERID;
    const PASSWORD = process.env.DB2_PASSWORD;
    const DEPLOYMENT_ID = process.env.DB2_DEPLOYMENT_ID;

    const baseUrl = `https://${HOSTNAME}/dbapi/v4`;

    try {
        // --- 1. アクセストークンの取得 ---
        const tokenResponse = await fetch(`${baseUrl}/auth/tokens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-deployment-id': DEPLOYMENT_ID },
            body: JSON.stringify({ userid: USERID, password: PASSWORD })
        });

        if (!tokenResponse.ok) throw new Error(`トークン取得失敗: ${tokenResponse.status}`);
        const tokenData = await tokenResponse.json();

        // --- 2. SQLの構築と実行 ---
        const sqlCommand = `INSERT INTO WXO_LOG (id, garoonId, name, "timestamp", question, answer, isPositive, categories, text) VALUES ('${data.id}', '${data.garoonId}', '${data.name}', '${data.timestamp}', '${data.question}', '${data.answer}', ${data.isPositive}, '${data.categories}', '${data.text}');`;

        const sqlResponse = await fetch(`${baseUrl}/sql_jobs`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenData.token}`,
                'Content-Type': 'application/json',
                'x-deployment-id': DEPLOYMENT_ID
            },
            body: JSON.stringify({ commands: sqlCommand, limit: 1, separator: ";", stop_on_error: "yes" })
        });

        const resultData = await sqlResponse.json();

        return {
            statusCode: 201,
            headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
            body: resultData
        };

    } catch (error) {
        return { statusCode: 500, body: { error: error.message } };
    }
}

// Code Engine用のエクスポート
module.exports.main = main;

// --- Ubuntu ローカル実行用 ---
if (require.main === module) {
    require('dotenv').config();
    const mockData = { id: "test-" + Date.now(), garoonId: "G-1", name: "Ubuntu", timestamp: new Date().toISOString(), question: "test?", answer: "test!", isPositive: 1, categories: "T", text: "local" };

    console.log("テスト実行を開始します...");
    main({ __ce_body: mockData })
        .then(res => console.log("実行結果:", JSON.stringify(res, null, 2)))
        .catch(err => console.error("実行エラー:", err));
}
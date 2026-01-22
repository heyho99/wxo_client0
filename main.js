require('dotenv').config(); // ローカルの .env 読み込み用
const axios = require('axios');

/**
 * Code Engine Function: DB2 Token取得 & データINSERTプロキシ
 * @param {Object} params - Code Engine から渡される引数
 */
async function main(params) {
    // 1. 入力データの取得 (ブラウザ/curlからのデータは __ce_body または params に入る)
    const data = params.__ce_body || params;

    // 2. 環境変数の取得 (Code Engine 設定または .env から)
    const HOSTNAME = process.env.DB2_HOSTNAME;
    const USERID = process.env.DB2_USERID;
    const PASSWORD = process.env.DB2_PASSWORD;
    const DEPLOYMENT_ID = process.env.DB2_DEPLOYMENT_ID;

    const baseUrl = `https://${HOSTNAME}/dbapi/v4`;

    try {
        // 3. DB2 アクセストークンの取得
        console.log("トークンを取得中...");
        const authRes = await axios.post(`${baseUrl}/auth/tokens`, {
            userid: USERID,
            password: PASSWORD
        }, { headers: { 'x-deployment-id': DEPLOYMENT_ID } });

        const accessToken = authRes.data.token;
        console.log("トークン取得成功。SQLを実行中...");

        // 4. SQLコマンドの構築
        const sqlCommand = `INSERT INTO WXO_LOG (id, garoonId, name, "timestamp", question, answer, isPositive, categories, text) VALUES ('${data.id}', '${data.garoonId}', '${data.name}', '${data.timestamp}', '${data.question}', '${data.answer}', ${data.isPositive}, '${data.categories}', '${data.text}');`;

        // 5. SQLジョブの実行 (POST /sql_jobs)
        const db2Res = await axios.post(`${baseUrl}/sql_jobs`, {
            commands: sqlCommand,
            limit: 1,
            separator: ";",
            stop_on_error: "yes"
        }, {
            headers: {
                'authorization': `Bearer ${accessToken}`,
                'x-deployment-id': DEPLOYMENT_ID
            }
        });

        // 6. 成功レスポンスの返却 (CORS対応ヘッダーを含む)
        return {
            statusCode: 201,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Content-Type": "application/json"
            },
            body: db2Res.data
        };

    } catch (error) {
        console.error("エラー詳細:", error.response ? error.response.data : error.message);
        return {
            statusCode: error.response ? error.response.status : 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: {
                error: "Operation Failed",
                message: error.message,
                details: error.response ? error.response.data : null
            }
        };
    }
}

// --- 重要：Code Engine が関数を認識するために必須のエクスポート ---
module.exports.main = main;

// --- ローカル実行用のテストコード (node main.js で実行時のみ動作) ---
if (require.main === module) {
    if (process.env.DB2_HOSTNAME) {
        const mockData = {
            id: "99",
            garoonId: "99",
            name: "usera",
            timestamp: new Date().toISOString(),
            question: "Test Question",
            answer: "Test Answer",
            isPositive: 1,
            categories: "Test",
            text: "This is a test from Ubuntu local execution."
        };
        main({ __ce_body: mockData }).then(res => console.log("実行結果:", JSON.stringify(res, null, 2)));
    } else {
        console.error("環境変数が設定されていません。.envファイルを確認してください。");
    }
}
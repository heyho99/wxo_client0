const axios = require('axios');

/**
 * Code Engine Function: DB2 Token取得 & データINSERTプロキシ
 */
async function main(params) {
    const data = params.__ce_body || params;
    const HOSTNAME = process.env.DB2_HOSTNAME;
    const USERID = process.env.DB2_USERID;
    const PASSWORD = process.env.DB2_PASSWORD;
    const DEPLOYMENT_ID = process.env.DB2_DEPLOYMENT_ID;

    const baseUrl = `https://${HOSTNAME}/dbapi/v4`;

    try {
        console.log("トークンを取得中...");
        const authRes = await axios.post(`${baseUrl}/auth/tokens`, {
            userid: USERID,
            password: PASSWORD
        }, { headers: { 'x-deployment-id': DEPLOYMENT_ID } });

        const accessToken = authRes.data.token;
        console.log("トークン取得成功。SQLを実行中...");

        const sqlCommand = `INSERT INTO WXO_LOG (id, garoonId, name, "timestamp", question, answer, isPositive, categories, text) VALUES ('${data.id}', '${data.garoonId}', '${data.name}', '${data.timestamp}', '${data.question}', '${data.answer}', ${data.isPositive}, '${data.categories}', '${data.text}');`;

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

        return { statusCode: 201, body: db2Res.data };
    } catch (error) {
        console.error("エラー詳細:", error.response ? error.response.data : error.message);
        return { statusCode: 500, error: error.message };
    }
}

// --- ローカル実行用のテストコード ---
const mockData = {
    id: "test-001",
    garoonId: "G-123",
    name: "Ubuntu Test",
    timestamp: new Date().toISOString(),
    question: "Test Question",
    answer: "Test Answer",
    isPositive: 1,
    categories: "Test",
    text: "This is a test from Ubuntu."
};

// 環境変数がセットされているか確認して実行
if (process.env.DB2_HOSTNAME) {
    main({ __ce_body: mockData }).then(console.log);
} else {
    console.error("環境変数が設定されていません。手順4を行ってください。");
}
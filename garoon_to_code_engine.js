(function () {
    'use strict';

    // ===============================================================
    // 0. 設定項目
    // ===============================================================

    // Code Engine Function のエンドポイント設定
    const db2Config = {
        apiUrl: "https://function-c3.25f0qwsr2onp.us-south.codeengine.appdomain.cloud/"
    };

    // Watsonx Orchestrate 設定
    const wxoConfig = {
        orchestrationID: "63c38798359e4eb9917d478a2b67fbfb_0e9590c3-c50a-4598-8e57-b604604cfc36",
        hostURL: "https://us-south.watson-orchestrate.cloud.ibm.com",
        rootElementID: "root",
        deploymentPlatform: "ibmcloud",
        crn: "crn:v1:bluemix:public:watsonx-orchestrate:us-south:a/63c38798359e4eb9917d478a2b67fbfb:0e9590c3-c50a-4598-8e57-b604604cfc36::",
        chatOptions: {
            agentId: "27e6dff3-4f30-42d4-b49a-d5c697328009",
            onLoad: onChatLoad,
        }
    };

    // ===============================================================
    // 1. 状態管理と Garoon 情報
    // ===============================================================
    let isChatInitialized = false;
    let question = "";
    let chatRootContainer = null;
    let statusContainer = null;

    const garoonUser = garoon.base.user.getLoginUser();

    // ===============================================================
    // 2. DB2 (Code Engine) 書き込み関数
    // ===============================================================

    /**
     * Code Engine 経由で DB2 にデータを保存します
     */
    async function writeToDB2(data) {
        try {
            console.log("DB2への書き込みを開始:", data);

            // JSON 形式で送信します
            const response = await fetch(db2Config.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                console.log("DB2への書き込み成功:", result);
                updateStatus(`DB2にログを記録しました (ID: ${result.jobId})`);
            } else {
                console.error("DB2書き込みエラー:", result.error);
                updateStatus(`エラー: ${result.error}`);
            }

        } catch (error) {
            console.error("ネットワークエラー:", error);
            updateStatus(`通信エラーが発生しました`);
        }
    }

    // ===============================================================
    // 3. Watsonx Orchestrate イベントハンドラ
    // ===============================================================

    async function feedbackHandler(event) {
        if (event["interactionType"] === 'submitted') {
            const answer = event["messageItem"]["text"];
            const categories = event["categories"] || [];
            const text = event["text"] || '';

            // 送信データの構築
            // ※timestamp は backend 側で自動生成するため省略可能です
            const feedbackData = {
                id: garoonUser.id,
                garoonId: String(garoonUser.garoonId),
                name: garoonUser.name,
                question: question,
                answer: answer,
                isPositive: event["isPositive"] ? 1 : 0, // 数値型に変換
                categories: !event["isPositive"] ? categories.join(', ') : '',
                text: !event["isPositive"] ? text : ''
            };

            console.log("Sending Feedback to DB2:", feedbackData);
            await writeToDB2(feedbackData);
        }
    }

    function preReceiveHandler(event) {
        const lastItem = event?.message?.content?.[event.message.content.length - 1];
        if (lastItem) {
            lastItem.message_options = {
                feedback: {
                    is_on: true,
                    show_positive_details: false,
                    show_negative_details: true,
                    negative_options: {
                        categories: ['正しくない', '未完了', '長すぎます', '関係ない', 'その他'],
                        disclaimer: "フィードバックに機密情報を含めないでください",
                    },
                },
            };
        }
    }

    function sendHandler(event) {
        question = event["message"]["message"]["content"];
    }

    function onChatLoad(instance) {
        instance.on('pre:receive', preReceiveHandler);
        instance.on('feedback', feedbackHandler);
        instance.on('send', sendHandler);
    }

    // ===============================================================
    // 4. UI と初期化 (省略なし)
    // ===============================================================

    function createDOMElements() {
        chatRootContainer = document.createElement('div');
        chatRootContainer.id = 'wxo-chat-root';
        statusContainer = document.createElement('p');
        statusContainer.style.position = 'fixed';
        statusContainer.style.bottom = '10px';
        statusContainer.style.right = '10px';
        statusContainer.style.background = '#333';
        statusContainer.style.color = '#fff';
        statusContainer.style.padding = '5px 10px';
        statusContainer.style.display = 'none';
        statusContainer.style.zIndex = '9999';

        document.body.appendChild(chatRootContainer);
        document.body.appendChild(statusContainer);
    }

    function updateStatus(message) {
        if (!statusContainer) return;
        statusContainer.innerText = message;
        statusContainer.style.display = 'block';
        setTimeout(() => { statusContainer.style.display = 'none'; }, 5000);
    }

    function initializeWatsonxChat() {
        if (isChatInitialized) return;
        isChatInitialized = true;
        window.wxOConfiguration = { ...wxoConfig, rootElementID: chatRootContainer.id };
        const script = document.createElement('script');
        script.src = `${wxoConfig.hostURL}/wxochat/wxoLoader.js?embed=true`;
        script.onload = () => { if (window.wxoLoader) window.wxoLoader.init(); };
        document.head.appendChild(script);
    }

    function main() {
        createDOMElements();
        initializeWatsonxChat();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }

})();
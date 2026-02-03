"""
WXO Test Automation - Code Engine Function

このスクリプトはIBM Code Engine上で動作し、
POSTリクエストで質問リスト（JSON配列）を受け取り、
Watsonx Orchestrate エージェントに送信し、
CSV形式で結果を返します。

環境変数:
    - IBM_CLOUD_API_KEY: IBM Cloud APIキー
    - WXO_INSTANCE_ID: WXOインスタンスID
    - WXO_API_HOST: WXO APIホスト (デフォルト: api.us-south.watson-orchestrate.cloud.ibm.com)

リクエストパラメータ:
    - agent_id: WXOエージェントID
    - questions: 質問リスト（文字列配列）
"""

import urllib.request
import json
import csv
import io
import os


def get_access_token(api_key):
    """
    IBM Cloud IAMからアクセストークンを取得します。
    """
    url = "https://iam.cloud.ibm.com/identity/token"
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
    
    data = f"grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey={api_key}".encode('utf-8')
    
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode('utf-8'))
        return result.get("access_token")


def send_chat_message(token, instance_id, agent_id, api_host, message_content):
    """
    Watsonx Orchestrate エージェントにチャットメッセージを送信します。
    """
    url = f"https://{api_host}/instances/{instance_id}/v1/orchestrate/{agent_id}/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
    
    payload = {
        "messages": [
            {
                "role": "user",
                "content": message_content
            }
        ],
        "stream": False
    }
    
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode('utf-8'))
        
        if 'choices' in result and len(result['choices']) > 0:
            return result['choices'][0]['message']['content'], None
        else:
            return str(result), None


def main(args):
    """
    Code Engine Function のエントリーポイント。
    POSTリクエストのbodyからJSON配列（質問リスト）を受け取り、
    CSVを返します。
    
    リクエスト形式:
        POST body: {"agent_id": "エージェントID", "questions": ["質問1", "質問2", ...]}
    
    レスポンス形式:
        CSV (Question, Answer, Status)
    """
    
    # 環境変数の取得
    api_key = os.getenv("IBM_CLOUD_API_KEY")
    instance_id = os.getenv("WXO_INSTANCE_ID")
    api_host = os.getenv("WXO_API_HOST", "api.us-south.watson-orchestrate.cloud.ibm.com")
    
    # リクエストからagent_idを取得
    agent_id = args.get("agent_id", "")
    
    if not api_key or not instance_id:
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps({"error": "Missing required environment variables (IBM_CLOUD_API_KEY, WXO_INSTANCE_ID)"})
        }
    
    if not agent_id:
        return {
            "statusCode": 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps({"error": "Missing required parameter: agent_id"})
        }
    
    try:
        # リクエストボディから質問リストを取得
        questions = args.get("questions", [])
        
        if not questions:
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": json.dumps({"error": "No questions provided"})
            }
        
        # アクセストークンの取得
        token = get_access_token(api_key)
        
        # 各質問を処理
        results = []
        for question in questions:
            question = question.strip() if isinstance(question, str) else ""
            
            if not question:
                results.append({
                    "Question": "",
                    "Answer": "",
                    "Status": "Skipped"
                })
                continue
            
            try:
                answer, error = send_chat_message(token, instance_id, agent_id, api_host, question)
                
                if error:
                    results.append({
                        "Question": question,
                        "Answer": "",
                        "Status": error
                    })
                else:
                    results.append({
                        "Question": question,
                        "Answer": answer,
                        "Status": "Success"
                    })
            except Exception as e:
                results.append({
                    "Question": question,
                    "Answer": "",
                    "Status": f"Error: {str(e)}"
                })
        
        # CSV変換 (BOM付きUTF-8)
        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=["Question", "Answer", "Status"],
            quoting=csv.QUOTE_ALL,
            lineterminator='\r\n',
            extrasaction='raise',
            strict=True
        )
        writer.writeheader()
        writer.writerows(results)
        
        # Excelで開いた際の文字化けを防ぐため BOM (\ufeff) を付与
        csv_body = "\ufeff" + output.getvalue()
        
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "text/csv; charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Content-Disposition": "attachment; filename=wxo_results.csv"
            },
            "body": csv_body
        }
    
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps({"error": str(e)})
        }


if __name__ == "__main__":
    # ローカルテスト用
    print("WXO Test Automation - Code Engine Function (ローカルテスト)")
    
    # テスト用の質問
    test_args = {
        "questions": [
            "仕入先がイグアス書式の契約書に合意してもらえない場合はどうすればいいでしょうか",
            "機密と明示されたもののみ機密情報として扱うに変更してくれ"
        ]
    }
    
    result = main(test_args)
    
    if result["statusCode"] == 200:
        with open("test_output.csv", "w", encoding="utf-8-sig", newline="") as f:
            f.write(result["body"])
        print("--- 成功！ ---")
        print("ファイル 'test_output.csv' が作成されました。")
    else:
        print(f"--- 失敗 (Status: {result['statusCode']}) ---")
        print(f"エラー内容: {result['body']}")
